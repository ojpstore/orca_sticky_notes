import assert from 'node:assert/strict'
import { test } from 'node:test'
import { COLORS, formatDate, newNote, persistable, visibleNotes, withDefaults } from './notes.js'

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

test('제목 없이 저장된 기존 메모도 읽을 수 있다', () => {
  const [old] = withDefaults([{ id: 'a', html: 'x', text: 'x', color: 'blue', updatedAt: 1 }])
  assert.equal(old.title, '')
  assert.deepEqual(persistable([old]), [old])
  assert.equal(withDefaults([{ ...old, title: '유지' }])[0].title, '유지')
})

test('검색이 원본 배열 순서를 바꾸지 않는다', () => {
  const notes = [note('a', 1), note('b', 2)]
  visibleNotes(notes, '')
  assert.deepEqual(notes.map((n) => n.updatedAt), [1, 2])
})

test('날짜는 오늘/올해/작년을 구분해서 표시한다', () => {
  const now = new Date(2026, 10, 6, 15, 30).getTime()
  assert.match(formatDate(new Date(2026, 10, 6, 9, 5).getTime(), 'ko-KR', now), /9:05/)
  assert.equal(formatDate(new Date(2026, 10, 5).getTime(), 'ko-KR', now), '11월 5일')
  assert.equal(formatDate(new Date(2025, 10, 5).getTime(), 'ko-KR', now), '2025년 11월 5일')
})
