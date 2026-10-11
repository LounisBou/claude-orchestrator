// hooks/tests/naming.test.ts
// The session's own rename: the name's shape, the tool declared at every start,
// the call that records the name and the turn's completion that runs the host's
// /rename with it — never from the call itself, which the host refuses.
import { expect, test } from 'claude-code/testing'
import { checkName, END_TOOL, register as registerNaming, RENAME_TOOL } from '../naming.ts'

// A registration is keyed by its event, and a tool call by its tool too: the
// file serves two tools.
function mounted(): { handlers: Record<string, Function>; matchers: Record<string, object | undefined> } {
  const handlers: Record<string, Function> = {}
  const matchers: Record<string, object | undefined> = {}
  registerNaming((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    const tool = args.length === 3 ? (args[1] as any).tool : undefined
    const key = tool === `mcp__orchestrator__${END_TOOL}` ? 'tool.call:end' : args[0]
    handlers[key] = args[args.length - 1] as Function
    matchers[key] = args.length === 3 ? args[1] : undefined
    return { catch: () => undefined }
  })
  return { handlers, matchers }
}

function fakeDollar(): { dollar: any; registered: any[]; runs: any[] } {
  const registered: any[] = []
  const runs: any[] = []
  const dollar = {
    env: { get: async (name: string) => (name === 'HOME' ? '/tmp/h' : undefined) },
    fs: { read: async () => '', write: async () => undefined },
    tool: { register: async (spec: any) => { registered.push(spec); return {} } },
    command: { run: (input: any) => { runs.push(input); return Promise.resolve({ text: '' }) } },
  }
  return { dollar, registered, runs }
}

test('a session names itself Orch or Coord, the subject in the launcher\'s shape', () => {
  expect(checkName('Orch : PTI améliorations UI')).toEqual({ name: 'Orch : PTI améliorations UI' })
  expect(checkName('Coord : main')).toEqual({ name: 'Coord : main' })
  expect(checkName('Orch : x')).toEqual({ name: 'Orch : x' })
  for (const bad of ['Agent : belt', 'Orch: no-space', 'Orch :  padded', 'Orch : padded ', 'Orch : ' + 'a'.repeat(26), '', 42]) {
    expect('refused' in checkName(bad)).toBe(true)
  }
  expect('refused' in checkName('Orch : ' + 'a'.repeat(25))).toBe(false)
})

test('every start declares the tool with its schema in the prompt', async () => {
  const { handlers, matchers } = mounted()
  expect(matchers['session.start']).toEqual({})
  expect(matchers['tool.call']).toEqual({ tool: `mcp__orchestrator__${RENAME_TOOL}` })
  const fx = fakeDollar()
  const e = {}
  expect(await handlers['session.start'](fx.dollar, e, (x: unknown) => x)).toBe(e)
  expect(fx.registered.map((spec: any) => spec.name)).toEqual(['rename_session', 'end_session'])
  expect(fx.registered.every((spec: any) => spec.isDeferred === false)).toBe(true)
})

test('the end is asked by a call and run when the turn completes, after the rename', async () => {
  const { handlers, matchers } = mounted()
  expect(matchers['tool.call:end']).toEqual({ tool: `mcp__orchestrator__${END_TOOL}` })
  const fx = fakeDollar()
  await handlers['tool.call'](fx.dollar, { name: 'Orch : phase-3' })
  expect(await handlers['tool.call:end'](fx.dollar, {})).toEqual({ result: 'This session ends when this turn ends.' })
  expect(fx.runs).toEqual([])
  await handlers['turn.complete'](fx.dollar, {}, (x: unknown) => x)
  expect(fx.runs).toEqual([{ command: 'rename', args: 'Orch : phase-3' }, { command: 'exit' }])
  await handlers['turn.complete'](fx.dollar, {}, (x: unknown) => x)
  expect(fx.runs.length).toBe(2)
})

test('the call records the name and the turn\'s completion runs the rename, once', async () => {
  const { handlers } = mounted()
  const fx = fakeDollar()
  const answer = await handlers['tool.call'](fx.dollar, { name: 'Orch : phase-3' })
  expect(answer).toEqual({ result: 'This session is renamed "Orch : phase-3" when this turn ends.' })
  // Nothing runs from the call itself: the host refuses a run the turn waits on.
  expect(fx.runs).toEqual([])
  const done = {}
  expect(await handlers['turn.complete'](fx.dollar, done, (x: unknown) => x)).toBe(done)
  expect(fx.runs).toEqual([{ command: 'rename', args: 'Orch : phase-3' }])
  await handlers['turn.complete'](fx.dollar, done, (x: unknown) => x)
  expect(fx.runs.length).toBe(1)
})

test('a session the launcher opened neither sees the tools nor renames or ends itself', async () => {
  const { handlers } = mounted()
  const fx = fakeDollar()
  fx.dollar.env.get = async (name: string) => (name === 'ORCHESTRATOR_SPAWNED' ? '1' : name === 'HOME' ? '/tmp/h' : undefined)
  const e = {}
  expect(await handlers['session.start'](fx.dollar, e, (x: unknown) => x)).toBe(e)
  expect(fx.registered).toEqual([])
  const answer = await handlers['tool.call'](fx.dollar, { name: 'Coord : norms check' })
  expect(answer.isError).toBe(true)
  expect((await handlers['tool.call:end'](fx.dollar, {})).isError).toBe(true)
  await handlers['turn.complete'](fx.dollar, {}, (x: unknown) => x)
  expect(fx.runs).toEqual([])
})

test('a refused name is said to the model and renames nothing', async () => {
  const { handlers } = mounted()
  const fx = fakeDollar()
  const answer = await handlers['tool.call'](fx.dollar, { name: 'Agent : belt' })
  expect(answer.isError).toBe(true)
  expect(answer.result).toContain('"Orch : <subject>" or "Coord : <subject>"')
  await handlers['turn.complete'](fx.dollar, {}, (x: unknown) => x)
  expect(fx.runs).toEqual([])
})
