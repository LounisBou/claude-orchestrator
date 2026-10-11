// hooks/tests/naming.test.ts
// The session's own rename: the name's shape, the tool declared at every start,
// the call that records the name and the turn's completion that runs the host's
// /rename with it — never from the call itself, which the host refuses.
import { expect, test } from 'claude-code/testing'
import { checkName, register as registerNaming, RENAME_TOOL } from '../naming.ts'

function mounted(): { handlers: Record<string, Function>; matchers: Record<string, object | undefined> } {
  const handlers: Record<string, Function> = {}
  const matchers: Record<string, object | undefined> = {}
  registerNaming((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    handlers[args[0]] = args[args.length - 1] as Function
    matchers[args[0]] = args.length === 3 ? args[1] : undefined
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
  expect(fx.registered.length).toBe(1)
  expect(fx.registered[0].name).toBe('rename_session')
  expect(fx.registered[0].isDeferred).toBe(false)
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

test('a session the launcher opened neither sees the tool nor renames itself', async () => {
  const { handlers } = mounted()
  const fx = fakeDollar()
  fx.dollar.env.get = async (name: string) => (name === 'ORCHESTRATOR_SPAWNED' ? '1' : name === 'HOME' ? '/tmp/h' : undefined)
  const e = {}
  expect(await handlers['session.start'](fx.dollar, e, (x: unknown) => x)).toBe(e)
  expect(fx.registered).toEqual([])
  const answer = await handlers['tool.call'](fx.dollar, { name: 'Coord : norms check' })
  expect(answer.isError).toBe(true)
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
