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
  updatedAt: now
})

// 제목 기능이 생기기 전에 저장된 메모에는 title이 없다.
export const withDefaults = (stored) => stored.map((note) => ({ title: '', ...note }))

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
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

// 오늘은 시각, 올해는 월·일, 그 이전은 연도까지 표시한다.
export function formatDate(timestamp, locale, now = Date.now()) {
  const date = new Date(timestamp)
  const today = new Date(now)
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
  }
  const options = { month: 'long', day: 'numeric' }
  if (date.getFullYear() !== today.getFullYear()) options.year = 'numeric'
  return date.toLocaleDateString(locale, options)
}
