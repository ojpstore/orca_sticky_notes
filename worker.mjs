import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

// 붙여넣기와 Enter가 한 덩어리로 오면 에이전트 TUI가 Enter를 줄바꿈으로 받을 수 있다. 제출이 안 되면 늘린다.
const ENTER_DELAY_MS = 300

// 메모를 터미널 입력으로 바꾼다. 메모 내용만으로는 실행되면 안 되고, 실행은 typeAndRun의 Enter로만 일어난다.
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

// 합쳐진 여러 줄은 메모에 없던 명령이 되므로 호출하는 쪽이 run을 꺼서 입력만 한다.
export async function typeAndRun(send, input, run, delayMs = ENTER_DELAY_MS) {
  if (!(await send(input))) return false
  if (!run) return true
  await new Promise((resolve) => setTimeout(resolve, delayMs))
  return send('\r')
}

// CLI의 PATH 등록은 PC마다 다르다. worker는 Orca.exe로 실행되므로 그 옆의 번들 CLI를 먼저 쓴다.
export function orcaCli(execPath = process.execPath, exists = existsSync) {
  const bundled = join(dirname(execPath), 'resources', 'bin', 'orca.exe')
  return exists(bundled) ? bundled : 'orca'
}

// CLI는 --json 실패 이유를 stderr가 아니라 stdout으로 보내서 execFile 오류에는 명령줄만 남는다.
export function cliResult(error, stdout) {
  let reply = null
  try {
    reply = JSON.parse(stdout)
  } catch {
    if (!error) throw new Error('orca CLI가 JSON이 아닌 응답을 보냈습니다.')
  }
  if (reply?.ok) return reply.result
  throw reply?.error?.message ? new Error(reply.error.message) : (error ?? new Error('orca CLI가 실패했습니다.'))
}

const listTerminals = () =>
  new Promise((resolve, reject) => {
    execFile(
      orcaCli(),
      ['terminal', 'list', '--include-visual-layouts', '--json'],
      {
        // 워커 환경에는 APPDATA가 없어서 CLI가 Orca 런타임을 찾지 못한다.
        env: { ...process.env, APPDATA: process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming') },
        maxBuffer: 32 * 1024 * 1024,
        timeout: 10000,
        windowsHide: true
      },
      (error, stdout) => {
        try {
          resolve(cliResult(error, stdout))
        } catch (failure) {
          reject(failure)
        }
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
    const send = async (text) => (await orca.host.call('terminal.sendText', { terminalId, text, enter: false })).accepted
    if (!(await typeAndRun(send, input, !flattened))) return { error: '터미널이 입력을 받지 않았습니다.' }
    return { title: target?.title ?? '터미널', flattened }
  })
}
