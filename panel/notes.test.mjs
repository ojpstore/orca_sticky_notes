import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EMOJI_GROUPS } from './emoji-data.js'
import { backupJson, COLORS, countByGroup, DEFAULT_EMOJIS, duplicateNote, extractVars, fillVars, matchesEmoji, mergeGroups, mergeNotes, newGroup, newNote, parseBackup, persistable, pruneDeleted, pushRecent, reorder, reorderGroups, syncGroups, syncNotes, ungroupOrphans, visibleNotes, withDefaults } from './notes.js'

const note = (text, updatedAt = 0) => ({ ...newNote(updatedAt), text })

test('새 메모는 고유 id와 등록된 색상을 가진다', () => {
  assert.notEqual(newNote(1).id, newNote(1).id)
  assert.ok(COLORS[newNote().color])
})

test('공백뿐인 메모는 저장하지 않는다', () => {
  const kept = note('내용')
  assert.deepEqual(persistable([note(''), note(' \n '), kept]), [kept])
})

test('검색은 대소문자를 구분하지 않고 최근 수정순으로 정렬한다', () => {
  const notes = [note('Alpha 회의', 1), note('beta', 2), note('alpha 정리', 3)]
  assert.deepEqual(visibleNotes(notes, ' ALPHA ').map((n) => n.updatedAt), [3, 1])
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.updatedAt), [3, 2, 1])
  assert.deepEqual(visibleNotes(notes, '없음'), [])
})

test('제목만 있어도 저장하고 검색된다', () => {
  const titled = { ...note(''), title: '장보기' }
  assert.deepEqual(persistable([titled, { ...note(''), title: '  ' }]), [titled])
  assert.deepEqual(visibleNotes([titled, note('다른 내용')], '장보기'), [titled])
})

test('조회 조건에 따라 제목 또는 내용에서만 찾는다', () => {
  const inTitle = { ...note('다른 글', 1), title: '회의' }
  const inText = { ...note('회의 내용', 2), title: '다른 제목' }
  const notes = [inTitle, inText]
  assert.deepEqual(visibleNotes(notes, '회의', 'all'), [inText, inTitle])
  assert.deepEqual(visibleNotes(notes, '회의', 'title'), [inTitle])
  assert.deepEqual(visibleNotes(notes, '회의', 'text'), [inText])
  assert.equal(visibleNotes(notes, '', 'title').length, 2)
})

test('고정 메모는 항상 위에 있고 작성일자 최신순으로 정렬된다', () => {
  const pin = (id, createdAt, updatedAt) => ({ ...note(id, updatedAt), id, pinned: true, createdAt })
  const notes = [
    { ...note('일반 최신', 100), id: 'normal-new' },
    pin('old-pin', 1, 90),
    { ...note('일반 과거', 50), id: 'normal-old' },
    pin('new-pin', 2, 10)
  ]
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.id), ['new-pin', 'old-pin', 'normal-new', 'normal-old'])
})

test('검색 결과에서도 고정 메모가 위에 있다', () => {
  const notes = [{ ...note('회의', 9), id: 'a' }, { ...note('회의', 1), id: 'b', pinned: true }, { ...note('기타', 1), id: 'c', pinned: true }]
  assert.deepEqual(visibleNotes(notes, '회의').map((n) => n.id), ['b', 'a'])
})

test('제목 없이 저장된 기존 메모도 읽을 수 있다', () => {
  const [old] = withDefaults([{ id: 'a', html: 'x', text: 'x', color: 'blue', updatedAt: 1 }])
  assert.equal(old.title, '')
  assert.equal(old.pinned, false)
  assert.equal(old.createdAt, 1)
  assert.deepEqual(persistable([old]), [old])
  assert.equal(withDefaults([{ ...old, title: '유지' }])[0].title, '유지')
})

test('검색이 원본 배열 순서를 바꾸지 않는다', () => {
  const notes = [note('a', 1), note('b', 2)]
  visibleNotes(notes, '')
  assert.deepEqual(notes.map((n) => n.updatedAt), [1, 2])
})

test('백업을 다시 읽으면 빈 메모를 뺀 같은 메모가 나온다', () => {
  const kept = { ...note('내용', 5), title: '제목', pinned: true }
  const group = newGroup('업무')
  const grouped = { ...note('그룹 메모', 6), group: group.id }
  assert.deepEqual(parseBackup(backupJson([kept, grouped, note('')], [group])), { notes: [kept, grouped], groups: [group] })
})

test('그룹이 없던 백업은 기본 그룹으로 읽는다', () => {
  const { group, ...old } = note('예전 메모')
  assert.deepEqual(parseBackup(JSON.stringify({ notes: [old] })), { notes: [{ ...old, group: '' }], groups: [] })
  assert.throws(() => parseBackup(JSON.stringify({ notes: [old], groups: [{ id: '', name: '기본' }] })))
  assert.throws(() => parseBackup(JSON.stringify({ notes: [{ ...old, group: 1 }] })))
})

test('그룹을 고르면 그 그룹의 메모만 보인다', () => {
  const notes = [{ ...note('a', 1), group: 'g' }, note('b', 2)]
  assert.deepEqual(visibleNotes(notes, '', 'all', 'g').map((n) => n.text), ['a'])
  assert.deepEqual(visibleNotes(notes, '', 'all', '').map((n) => n.text), ['b'])
  assert.equal(visibleNotes(notes, '').length, 2)
})

test('없는 그룹의 메모는 기본으로 옮기고 가져온 그룹은 기존 이름을 유지한다', () => {
  const notes = [{ ...note('a'), group: 'gone' }, { ...note('b'), group: 'kept' }]
  assert.deepEqual(ungroupOrphans(notes, [{ id: 'kept', name: 'k' }]).map((n) => n.group), ['', 'kept'])
  const mine = [{ id: 'x', name: '내 이름' }]
  assert.deepEqual(mergeGroups(mine, [{ id: 'x', name: '파일' }, { id: 'y', name: '새 그룹' }]), [...mine, { id: 'y', name: '새 그룹' }])
})

test('형식이 틀린 백업은 전체를 거부한다', () => {
  const good = note('내용')
  const file = (notes) => JSON.stringify({ notes })
  assert.throws(() => parseBackup('메모 아님'))
  assert.throws(() => parseBackup('null'))
  assert.throws(() => parseBackup('{}'))
  assert.throws(() => parseBackup(file([good, null])))
  assert.throws(() => parseBackup(file([{ ...good, title: 1 }])))
  assert.throws(() => parseBackup(file([{ ...good, color: 'constructor' }])))
  assert.throws(() => parseBackup(file([{ ...good, updatedAt: '1' }])))
})

test('가져오기는 기존 메모를 지우지 않고 같은 id는 최근 수정본만 남긴다', () => {
  const at = (id, updatedAt) => ({ ...note(id, updatedAt), id })
  const notes = [at('only-mine', 1), at('mine-newer', 9), at('file-newer', 1)]
  const merged = mergeNotes(notes, [at('mine-newer', 2), at('file-newer', 9), at('only-file', 1)])
  assert.deepEqual(merged.map((n) => [n.id, n.updatedAt]), [['only-mine', 1], ['mine-newer', 9], ['file-newer', 9], ['only-file', 1]])
  assert.equal(merged.filter((n) => !notes.includes(n)).length, 2)
})

const allEmojis = EMOJI_GROUPS.flatMap((group) => group.emojis)

test('기본 이모지는 모두 데이터에 있어서 이름을 보여 줄 수 있다', () => {
  const glyphs = new Set(allEmojis.map((entry) => entry.e))
  assert.deepEqual(DEFAULT_EMOJIS.filter((emoji) => !glyphs.has(emoji)), [])
})

test('피부색이 있는 이모지는 5종을 모두 가진다', () => {
  assert.ok(allEmojis.some((entry) => entry.s))
  assert.ok(allEmojis.every((entry) => !entry.s || entry.s.length === 5))
})

test('고른 이모지가 맨 앞으로 오고 개수는 늘지 않는다', () => {
  const pushed = pushRecent(DEFAULT_EMOJIS, '🦄')
  assert.equal(pushed[0], '🦄')
  assert.equal(pushed.length, DEFAULT_EMOJIS.length)
  assert.deepEqual(pushRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'])
})

test('이모지를 한글 이름, 한글 태그, 영어로 찾는다', () => {
  const found = (query) => allEmojis.filter((entry) => matchesEmoji(entry, query)).map((entry) => entry.e)
  assert.ok(found('고양이').includes('🐱'))
  assert.ok(found('따봉').includes('👍'))
  assert.ok(found(' Thumbs ').includes('👍'))
  assert.deepEqual(found('없는검색어'), [])
  assert.equal(found('').length, allEmojis.length)
})

test('끌어서 바꾼 순서는 수정해도 유지되고 새 메모는 맨 위에 온다', () => {
  const notes = [{ ...note('a', 3), id: 'a' }, { ...note('b', 2), id: 'b' }, { ...note('c', 1), id: 'c' }]
  reorder(notes, ['c', 'a', 'b'])
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.id), ['c', 'a', 'b'])
  notes[1].updatedAt = 99
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.id), ['c', 'a', 'b'])
  notes.push({ ...note('d', 100), id: 'd' })
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.id), ['d', 'c', 'a', 'b'])
})

test('검색 중에 바꾼 순서는 숨겨진 메모의 자리를 건드리지 않는다', () => {
  const notes = [{ ...note('x', 3), id: 'a' }, { ...note('y', 2), id: 'hidden' }, { ...note('x', 1), id: 'c' }]
  reorder(notes, ['c', 'a'])
  assert.deepEqual(visibleNotes(notes, '').map((n) => n.id), ['c', 'hidden', 'a'])
})

test('색상 필터로 선택한 색상의 메모만 본다', () => {
  const notes = [
    { ...note('a', 1), color: 'yellow' },
    { ...note('b', 2), color: 'blue' },
    { ...note('c', 3), color: 'blue' }
  ]
  assert.deepEqual(visibleNotes(notes, '', 'all', null, 'blue').map((n) => n.text), ['c', 'b'])
  assert.equal(visibleNotes(notes, '', 'all', null, 'pink').length, 0)
  assert.equal(visibleNotes(notes, '', 'all', null, null).length, 3)
})

test('메모 복제는 새 id와 복사본 제목을 만들고 수동 순서는 비운다', () => {
  const orig = { ...note('본문', 1), title: '원본', color: 'green', group: 'g1', order: 50 }
  const copy = duplicateNote(orig, 100)
  assert.notEqual(copy.id, orig.id)
  assert.equal(copy.title, '원본 (복사본)')
  assert.equal(copy.text, '본문')
  assert.equal(copy.color, 'green')
  assert.equal(copy.group, 'g1')
  assert.equal(copy.order, undefined)
  assert.equal(copy.createdAt, 100)
  assert.equal(duplicateNote({ ...note('제목 없음', 1), title: '  ' }, 200).title, '')
})

test('그룹별 메모 개수는 빈 메모를 빼고 센다', () => {
  const notes = [note('a'), { ...note('b'), group: 'g1' }, { ...note('c'), group: 'g1' }, note('')]
  assert.deepEqual(countByGroup(notes), { all: 3, '': 1, g1: 2 })
})

test('그룹 탭 순서를 바꾸면 누락된 그룹도 뒤에 남긴다', () => {
  const groups = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }]
  assert.deepEqual(reorderGroups(groups, ['c', 'a']).map((g) => g.id), ['c', 'a', 'b'])
})

test('변수 추출과 치환은 중복을 없애고 순서를 지킨다', () => {
  const template = 'git checkout -b {{ branch }} && echo {{branch}} {{ msg }} {{  }}'
  assert.deepEqual(extractVars(template), ['branch', 'msg'])
  assert.equal(fillVars(template, { branch: 'feat/x', msg: 'hi' }), 'git checkout -b feat/x && echo feat/x hi {{  }}')
  assert.equal(fillVars('그대로 {{keep}}', {}), '그대로 {{keep}}')
})

test('다중 창 동기화는 최신 수정본과 삭제 기록을 함께 반영하고 복원을 허용한다', () => {
  const a1 = { ...note('a-old', 1), id: 'a' }
  const a2 = { ...note('a-new', 5), id: 'a' }
  const deleted = { ...note('gone', 3), id: 'd' }
  const restored = { ...note('back', 10), id: 'r' }
  const synced = syncNotes([a1, restored], [a2, deleted], { d: 4, r: 5 })
  assert.deepEqual(synced.map((n) => [n.id, n.text]), [['a', 'a-new'], ['r', 'back']])

  const groups = syncGroups([{ id: 'g1', name: '로컬' }], [{ id: 'g2', name: '원격' }, { id: 'g3', name: '삭제됨' }], { g3: 10 })
  assert.deepEqual(groups.map((g) => g.id), ['g1', 'g2'])

  assert.deepEqual(pruneDeleted({ old: 100, fresh: 950 }, 1000, 100), { fresh: 950 })
})
