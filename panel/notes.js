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

// 아직 고른 이모지가 없을 때 '자주 사용'에 보여 주는 목록이다. 이 길이가 '자주 사용'의 최대 개수다.
export const DEFAULT_EMOJIS = '📌 ⭐ ✅ ❌ ⚠️ ❗ ❓ 💡 🔥 🚀 🎯 🏆 📝 📅 ⏰ 📎 🔗 📁 📊 💻 🐛 🔧 🔒 🔑 💰 🛒 🏠 ✈️ 🍀 🎉 ❤️ 👍 👀 🙂 😂 😢 😡 🤔 🙏 💪'.split(' ')

export const pushRecent = (recent, emoji) =>
  [emoji, ...recent.filter((other) => other !== emoji)].slice(0, DEFAULT_EMOJIS.length)

export const matchesEmoji = (entry, query) => `${entry.n} ${entry.k}`.includes(query.trim().toLocaleLowerCase())

// crypto.randomUUID는 보안 컨텍스트가 필요해서 샌드박스 프레임에서 보장되지 않는다.
const newId = (now) => `${now.toString(36)}-${Math.random().toString(36).slice(2)}`

// 그룹 id ''는 이름을 바꾸거나 지울 수 없는 '기본' 그룹이다.
export const newNote = (now = Date.now(), group = '') => ({
  id: newId(now),
  group,
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
  stored.map((note) => ({ title: '', pinned: false, group: '', createdAt: note.updatedAt, ...note }))

export const newGroup = (name, now = Date.now()) => ({ id: newId(now), name })

// 그룹 목록에 없는 그룹을 가리키는 메모는 '기본'으로 옮긴다. 그룹이 지워졌거나 그룹 없이 가져온 메모다.
export function ungroupOrphans(notes, groups) {
  const ids = new Set(groups.map((group) => group.id))
  for (const note of notes) if (!ids.has(note.group)) note.group = ''
  return notes
}

// Windows 스티커 메모처럼 제목도 내용도 없는 메모는 남기지 않는다.
export const persistable = (notes) => notes.filter((note) => note.title.trim() || note.text.trim())

const SEARCH_FIELDS = {
  all: (note) => `${note.title}\n${note.text}`,
  title: (note) => note.title,
  text: (note) => note.text
}

// group이 null이면 모든 그룹, color가 null이면 모든 색상의 메모를 보여 준다.
export function visibleNotes(notes, query, scope = 'all', group = null, color = null) {
  const needle = query.trim().toLocaleLowerCase()
  const field = SEARCH_FIELDS[scope]
  return notes
    .filter((note) => group === null || note.group === group)
    .filter((note) => color === null || note.color === color)
    .filter((note) => field(note).toLocaleLowerCase().includes(needle))
    .sort(byPinThenDate)
}

export function duplicateNote(note, now = Date.now()) {
  const { order, ...rest } = note
  return {
    ...rest,
    id: newId(now),
    title: note.title.trim() ? `${note.title} (복사본)` : '',
    createdAt: now,
    updatedAt: now
  }
}

export function countByGroup(notes) {
  const counts = { all: 0, '': 0 }
  for (const note of persistable(notes)) {
    counts.all += 1
    counts[note.group] = (counts[note.group] ?? 0) + 1
  }
  return counts
}

export function reorderGroups(groups, ids) {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const ordered = ids.map((id) => byId.get(id)).filter(Boolean)
  const seen = new Set(ordered.map((group) => group.id))
  return [...ordered, ...groups.filter((group) => !seen.has(group.id))]
}

const VAR_PATTERN = /\{\{([^{}]+)\}\}/g

export function extractVars(text) {
  const seen = new Set()
  const vars = []
  for (const [, raw] of text.matchAll(VAR_PATTERN)) {
    const name = raw.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    vars.push(name)
  }
  return vars
}

export function fillVars(text, values) {
  return text.replace(VAR_PATTERN, (match, raw) => {
    const name = raw.trim()
    return name && Object.hasOwn(values, name) ? values[name] : match
  })
}

// 고정 메모가 항상 위에 오고 그 안에서는 작성일자 최신순, 나머지는 수정일자 최신순이다.
// 끌어서 순서를 바꾼 메모는 order가 정렬 키를 대신해서 수정해도 자리를 지킨다.
const sortKey = (note) => note.order ?? (note.pinned ? note.createdAt : note.updatedAt)

function byPinThenDate(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return sortKey(b) - sortKey(a)
}

// ids는 화면에 보이는 순서대로 바꾼 메모들이다. 그 메모들이 쓰던 정렬 키를 새 순서대로 나눠 가지므로
// 검색으로 숨겨진 메모와의 상대 위치는 그대로다. 새 메모는 지금 시각이 키라서 계속 맨 위에 온다.
export function reorder(notes, ids) {
  const moved = ids.map((id) => notes.find((note) => note.id === id))
  const keys = moved.map(sortKey).sort((a, b) => b - a)
  moved.forEach((note, index) => (note.order = keys[index]))
  return notes
}

const isNote = (note) =>
  typeof note?.id === 'string' &&
  typeof note.title === 'string' &&
  typeof note.html === 'string' &&
  typeof note.text === 'string' &&
  typeof (note.group ?? '') === 'string' &&
  Object.hasOwn(COLORS, note.color) &&
  typeof note.pinned === 'boolean' &&
  (note.order === undefined || Number.isFinite(note.order)) &&
  Number.isFinite(note.createdAt) &&
  Number.isFinite(note.updatedAt)

const isGroup = (group) => typeof group?.id === 'string' && group.id !== '' && typeof group.name === 'string'

export const backupJson = (notes, groups = []) => JSON.stringify({ version: 1, groups, notes: persistable(notes) }, null, 2)

// 파일은 외부 입력이다. 하나라도 형식이 틀리면 일부만 들여오지 않고 전체를 거부한다.
// 그룹이 생기기 전의 백업에는 groups가 없다.
export function parseBackup(json) {
  const { notes, groups = [] } = JSON.parse(json) ?? {}
  if (!Array.isArray(notes) || !notes.every(isNote)) throw new Error('백업 파일 형식이 아닙니다.')
  if (!Array.isArray(groups) || !groups.every(isGroup)) throw new Error('백업 파일 형식이 아닙니다.')
  return { notes: withDefaults(persistable(notes)), groups }
}

// 기존 메모를 지우지 않는다. 같은 id는 더 최근에 수정된 쪽만 남긴다.
export function mergeNotes(notes, imported) {
  const byId = new Map(notes.map((note) => [note.id, note]))
  for (const note of imported) {
    const mine = byId.get(note.id)
    if (!mine || note.updatedAt > mine.updatedAt) byId.set(note.id, note)
  }
  return [...byId.values()]
}

// 같은 id의 그룹은 지금 이름을 유지한다.
export const mergeGroups = (groups, imported) => [
  ...groups,
  ...imported.filter((group) => !groups.some((mine) => mine.id === group.id))
]

// 다중 창 동시 편집 병합: 삭제 시각이 수정 시각보다 같거나 최신이면 지우고, 나머지는 최신 수정본을 남긴다.
export function syncNotes(local, remote, deleted = {}) {
  return mergeNotes(local, remote).filter((note) => !(deleted[note.id] >= note.updatedAt))
}

export function syncGroups(local, remote, deleted = {}) {
  return mergeGroups(local, remote).filter((group) => !deleted[group.id])
}

export function pruneDeleted(deleted, now = Date.now(), maxAgeMs = 30 * 86400_000) {
  const kept = {}
  for (const [id, at] of Object.entries(deleted ?? {})) {
    if (Number.isFinite(at) && now - at <= maxAgeMs) kept[id] = at
  }
  return kept
}
