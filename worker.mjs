import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

// 메모를 터미널 입력으로 바꾼다. 어떤 경우에도 입력만 하고 실행되면 안 된다.
// 일반 셸은 bracketed paste를 보내도 PowerShell이 앞줄을 실행하므로(직접 확인) 한 줄로 합친다.
export function terminalInput(text, isAgent) {
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ') // 편집기가 넣는 nbsp는 셸 명령을 깨뜨린다.
    .replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '') // ESC 등 제어 문자로 붙여넣기를 빠져나가지 못하게 한다.
    .trim()
  if (isAgent) return { input: `\x1b[200~${clean.replace(/\n/g, '\r')}\x1b[201~`, flattened: false }
  const input = clean.split(/\s*\n\s*/).join(' ')
  return { input, flattened: input !== clean }
}

function* walk(value) {
  if (!value || typeof value !== 'object') return
  yield value
  for (const child of Object.values(value)) yield* walk(child)
}

// 플러그인 API는 활성 탭을 알려주지 않아서 CLI의 레이아웃에서 찾는다.
// ponytail: 탭 그룹이 나뉘어 있으면 어느 그룹이 포커스인지 알 수 없어 첫 그룹을 쓴다. 패널에 대상 이름을 보여줘서 드러낸다.
export function activeTerminalId(layouts, terminalIds) {
  for (const group of walk(layouts)) {
    if (!group.activeTabId || !Array.isArray(group.tabs)) continue
    const tab = group.tabs.find((candidate) => candidate.tabId === group.activeTabId)
    if (!tab) continue
    for (const pane of walk(tab.panes)) {
      if (pane.type === 'terminal' && pane.leafId === tab.activeLeafId && terminalIds.has(pane.handle)) {
        return pane.handle
      }
    }
  }
  return null
}

const listTerminals = () =>
  new Promise((resolve, reject) => {
    execFile(
      'orca',
      ['terminal', 'list', '--include-visual-layouts', '--json'],
      {
        // 워커 환경에는 APPDATA가 없어서 CLI가 Orca 런타임을 찾지 못한다.
        env: { ...process.env, APPDATA: process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming') },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10000,
        windowsHide: true
      },
      (error, stdout) => {
        if (error) reject(error)
        else resolve(JSON.parse(stdout).result)
      }
    )
  })

export default function activate(orca) {
  orca.panels.handle('terminal.apply', async ({ text }) => {
    const context = await orca.host.call('workspace.readContext')
    if (!context) return { error: '열린 워크스페이스가 없습니다.' }

    const { terminals, visualLayouts } = await listTerminals()
    const terminalIds = new Set(context.terminals.map((terminal) => terminal.id))
    const terminalId = activeTerminalId(visualLayouts, terminalIds)
    if (!terminalId) return { error: '활성 탭이 터미널이 아닙니다.' }

    const target = terminals.find((terminal) => terminal.handle === terminalId)
    const { input, flattened } = terminalInput(text, Boolean(target?.agentIdentity))
    const { accepted } = await orca.host.call('terminal.sendText', { terminalId, text: input, enter: false })
    if (!accepted) return { error: '터미널이 입력을 받지 않았습니다.' }
    return { title: target?.title ?? '터미널', flattened }
  })
}
