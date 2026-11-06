import assert from 'node:assert/strict'
import { test } from 'node:test'
import { join } from 'node:path'
import { activeTerminalId, orcaCli, terminalInput, typeAndRun } from './worker.mjs'

test('셸에는 여러 줄을 한 줄로 합쳐서 실행되지 않게 한다', () => {
  assert.deepEqual(terminalInput('echo a\r\n\n  echo b\n', false), { input: 'echo a echo b', flattened: true })
  assert.deepEqual(terminalInput('git status', false), { input: 'git status', flattened: false })
})

test('에이전트에는 줄바꿈을 유지해서 붙여넣는다', () => {
  assert.deepEqual(terminalInput('첫 줄\n둘째 줄', true), {
    input: '\x1b[200~첫 줄\r둘째 줄\x1b[201~',
    flattened: false
  })
})

test('제어 문자로 붙여넣기를 빠져나갈 수 없다', () => {
  const { input } = terminalInput('a\x1b[201~\x03b\x9bc', true)
  assert.equal(input, '\x1b[200~a[201~bc\x1b[201~')
  assert.equal(terminalInput('rm x\r', false).input, 'rm x')
})

test('nbsp는 일반 공백으로 바꾼다', () => {
  assert.equal(terminalInput('git status', false).input, 'git status')
})

test('입력한 뒤 Enter를 따로 보내고, 합친 여러 줄이나 거부된 입력은 실행하지 않는다', async () => {
  const sender = (accepted = true) => {
    const sent = []
    return { sent, send: async (text) => (sent.push(text), accepted) }
  }
  const run = sender()
  assert.equal(await typeAndRun(run.send, 'ls', true, 0), true)
  assert.deepEqual(run.sent, ['ls', '\r'])
  const typeOnly = sender()
  assert.equal(await typeAndRun(typeOnly.send, 'a b', false, 0), true)
  assert.deepEqual(typeOnly.sent, ['a b'])
  const refused = sender(false)
  assert.equal(await typeAndRun(refused.send, 'ls', true, 0), false)
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
