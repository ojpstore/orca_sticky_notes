// DOM에 의존하지 않는 메모 로직. index.html과 notes.test.mjs가 함께 사용한다.

export const COLORS = {
  yellow: '#e6bd1a',
  green: '#7cc47f',
  pink: '#ee80b1',
  purple: '#b48ae0',
  blue: '#5cb3e8',
  gray: '#a3a3a3',
  charcoal: '#6b6b6b'
}

// crypto.randomUUID는 보안 컨텍스트가 필요해서 샌드박스 프레임에서 보장되지 않는다.
export const newNote = (now = Date.now()) => ({
  id: `${now.toString(36)}-${Math.random().toString(36).slice(2)}`,
  title: '',
  html: '',
  text: '',
  color: 'yellow',
  pinned: false,
  createdAt: now,
  updatedAt: now
})

// 이전 버전이 저장한 메모에는 없는 필드를 채운다. 작성일자는 기록된 적이 없어서 수정 시각으로 대신한다.
export const withDefaults = (stored) =>
  stored.map((note) => ({ title: '', pinned: false, createdAt: note.updatedAt, ...note }))

// Windows 스티커 메모처럼 제목도 내용도 없는 메모는 남기지 않는다.
export const persistable = (notes) => notes.filter((note) => note.title.trim() || note.text.trim())

const SEARCH_FIELDS = {
  all: (note) => `${note.title}\n${note.text}`,
  title: (note) => note.title,
  text: (note) => note.text
}

export function visibleNotes(notes, query, scope = 'all') {
  const needle = query.trim().toLocaleLowerCase()
  const field = SEARCH_FIELDS[scope]
  return notes
    .filter((note) => field(note).toLocaleLowerCase().includes(needle))
    .sort(byPinThenDate)
}

// 고정 메모가 항상 위에 오고 그 안에서는 작성일자 최신순, 나머지는 수정일자 최신순이다.
function byPinThenDate(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return a.pinned ? b.createdAt - a.createdAt : b.updatedAt - a.updatedAt
}

export const formatDate = (timestamp, locale) =>
  new Date(timestamp).toLocaleString(locale, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
