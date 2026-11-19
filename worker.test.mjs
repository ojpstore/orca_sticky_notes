import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { activeTerminalId, cliResult, clipboardCommand, orcaCli, terminalInput, typeAndRun } from './worker.mjs'

test('셸에는 여러 줄을 한 줄로 합쳐서 실행되지 않게 한다', () => {
  assert.deepEqual(terminalInput('echo a\r\n\n  echo b\n', false), { input: ['echo a echo b'], flattened: true })
  assert.deepEqual(terminalInput('git status', false), { input: ['git status'], flattened: false })
})

test('에이전트에는 줄마다 붙여넣고 Ctrl+J로 줄바꿈해서 접히지 않게 한다', () => {
  assert.deepEqual(terminalInput('첫 줄\n\n  - 둘째', true), {
    input: ['\x1b[200~첫 줄\x1b[201~', '\n', '\n', '\x1b[200~  - 둘째\x1b[201~'],
    flattened: false
  })
})

test('제어 문자로 붙여넣기를 빠져나갈 수 없다', () => {
  const { input } = terminalInput('a\x1b[201~\x03b\x9bc', true)
  assert.deepEqual(input, ['\x1b[200~a[201~bc\x1b[201~'])
  assert.deepEqual(terminalInput('rm x\r', false).input, ['rm x'])
})

test('nbsp는 일반 공백으로 바꾼다', () => {
  assert.deepEqual(terminalInput('git status', false).input, ['git status'])
})

test('입력한 뒤 Enter를 따로 보내고, 합친 여러 줄이나 거부된 입력은 실행하지 않는다', async () => {
  const sender = (accepted = true) => {
    const sent = []
    return { sent, send: async (text) => (sent.push(text), accepted) }
  }
  const run = sender()
  assert.equal(await typeAndRun(run.send, ['ls'], true, 0, 0), true)
  assert.deepEqual(run.sent, ['ls', '\r'])
  const typeOnly = sender()
  assert.equal(await typeAndRun(typeOnly.send, ['a', '\n', 'b'], false, 0, 0), true)
  assert.deepEqual(typeOnly.sent, ['a', '\n', 'b'])
  const refused = sender(false)
  assert.equal(await typeAndRun(refused.send, ['ls', 'x'], true, 0, 0), false)
  assert.deepEqual(refused.sent, ['ls'])
})

const pane = (leafId, handle) => ({ type: 'terminal', leafId, handle })
const tab = (tabId, activeLeafId, panes) => ({ tabId, activeLeafId, panes })

test('포커스 워크스페이스의 활성 탭과 활성 패널을 찾는다', () => {
  const layouts = [
    { root: { activeTabId: 'x', tabs: [tab('x', 'l0', pane('l0', 'other'))] } },
    {
      root: {
        activeTabId: 't2',
        tabs: [
          tab('t1', 'l1', pane('l1', 'first')),
          tab('t2', 'l3', { type: 'split', first: pane('l2', 'left'), second: pane('l3', 'right') })
        ]
      }
    }
  ]
  assert.equal(activeTerminalId(layouts, new Set(['first', 'left', 'right'])), 'right')
})

test('활성 탭이 터미널이 아니면 찾지 못한다', () => {
  const layouts = [{ root: { activeTabId: 'editor', tabs: [tab('t1', 'l1', pane('l1', 'first'))] } }]
  assert.equal(activeTerminalId(layouts, new Set(['first'])), null)
})

test('PATH에 등록되지 않아도 앱에 번들된 CLI를 쓰고, 없으면 PATH로 돌아간다', () => {
  const execPath = join('C:', 'Orca', 'Orca.exe')
  const bundled = join('C:', 'Orca', 'resources', 'bin', 'orca.exe')
  assert.equal(orcaCli(execPath, (path) => path === bundled), bundled)
  assert.equal(orcaCli(execPath, () => false), 'orca')
})

test('CLI가 stdout JSON으로 알린 실패 이유를 오류 메시지로 쓴다', () => {
  const failed = new Error('Command failed: orca')
  const stdout = JSON.stringify({ ok: false, error: { code: 'runtime_unavailable', message: 'Start the Orca app first.' } })
  assert.throws(() => cliResult(failed, stdout), /Start the Orca app first\./)
  assert.throws(() => cliResult(failed, ''), /Command failed: orca/)
  assert.deepEqual(cliResult(null, JSON.stringify({ ok: true, result: { terminals: [] } })), { terminals: [] })
})

test('플랫폼에 맞는 클립보드 명령을 고른다', () => {
  assert.equal(clipboardCommand('win32').file, 'powershell.exe')
  assert.equal(clipboardCommand('darwin').file, 'pbcopy')
  assert.equal(clipboardCommand('linux').file, 'wl-copy')
})
