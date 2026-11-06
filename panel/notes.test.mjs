import assert from 'node:assert/strict'
import { test } from 'node:test'
import { backupJson, COLORS, formatDate, mergeNotes, newNote, parseBackup, persistable, visibleNotes, withDefaults } from './notes.js'

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

test('날짜는 항상 연월일과 시분을 표시한다', () => {
  // 오전/AM 표기는 런타임의 ICU 데이터에 따라 달라서 검사하지 않는다.
  assert.match(formatDate(new Date(2026, 10, 6, 9, 5).getTime(), 'ko-KR'), /^2026\. 11\. 6\. .+ 9:05$/)
})

test('백업을 다시 읽으면 빈 메모를 뺀 같은 메모가 나온다', () => {
  const kept = { ...note('내용', 5), title: '제목', pinned: true }
  assert.deepEqual(parseBackup(backupJson([kept, note('')])), [kept])
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
