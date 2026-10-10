// hooks/tests/push-guard.test.ts
// The push decision's boundaries, verbatim from the plan, and the wiring that
// serves it: the marker the launcher leaves, the Bash command where the event
// carries it (the tool's arguments sit beside the tool name, never under an
// `input`), and the deny the model reads back in the tool's place. The forces
// themselves are pinned by the tokeniser's own fixtures (tokenizer.test.ts).
import { expect, test } from 'claude-code/testing'
import { pushDecision, register as registerGuards } from '../guards.ts'

test('a marked session refuses a forced push and names the lease it accepts', () => {
  const d = pushDecision('1', 'git push --force origin main')
  expect(d?.deny).toContain('git push refused')
  expect(d?.deny).toContain('--force-with-lease=<branch>:<sha>')
})

test('an unmarked session and an unforced push both pass', () => {
  expect(pushDecision(undefined, 'git push --force origin main')).toBeNull()   // the operator's own sessions
  expect(pushDecision('1', 'git push origin main')).toBeNull()
  expect(pushDecision('1', 'git push --force-with-lease=main:' + 'a'.repeat(40) + ' origin main')).toBeNull()
})

test('a command the guard cannot read passes', () => {
  expect(pushDecision('1', '')).toBeNull()
})

// The wiring half, faked the context gate's way: the harness passes a reduced
// $, so the whole of it is faked — here the marker by its literal name and the
// log a failure writes, the two seams the push handler reads.
const HOME = '/tmp/h'
const LOG = `${HOME}/.claude/claude-orchestrator/hooks-module.log`

function fakeDollar(setup: { spawned?: string; noEnv?: boolean }): { dollar: any; written: string[] } {
  const written: string[] = []
  const env = { HOME, ...(setup.spawned === undefined ? {} : { ORCHESTRATOR_SPAWNED: setup.spawned }) }
  const dollar = {
    env: {
      get: async (name: string) => {
        if (name === 'ORCHESTRATOR_SPAWNED' && setup.noEnv) throw new Error('the marker cannot be read')
        return env[name]
      },
    },
    fs: {
      read: async (p: string) => { if (p === LOG) return ''; throw new Error(`unread: ${p}`) },
      write: async (p: string, text: string) => { if (p === LOG) written.push(text) },
    },
  }
  return { dollar, written }
}

function mounted(): { handlers: Record<string, Function>; matchers: Record<string, object | undefined> } {
  const handlers: Record<string, Function> = {}
  const matchers: Record<string, object | undefined> = {}
  registerGuards((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    handlers[args[0]] = args[args.length - 1] as Function
    matchers[args[0]] = args.length === 3 ? args[1] : undefined
    // The engine's on returns a registration taking one .catch; the fake
    // accepts it and drops it — the body's own catch is what the wiring tests.
    return { catch: () => undefined }
  })
  return { handlers, matchers }
}

// One Bash call as tool.call carries it: the tool, the call's id, and the
// command beside them.
const bashCall = (command: string) => ({ tool: 'Bash', tool_use_id: 't1', command })

async function callBash(handler: Function, dollar: any, e: object) {
  let passedThrough: unknown = null
  const answer = await handler(dollar, e, (x: unknown) => { passedThrough = x; return x })
  return { answer, passedThrough }
}

test('the guard mounts on tool.call for the Bash tool alone', () => {
  expect(mounted().matchers['tool.call']).toEqual({ tool: 'Bash' })
})

test("a marked session's forced push is denied, the tool never asked", async () => {
  const { handlers } = mounted()
  const { dollar } = fakeDollar({ spawned: '1' })
  const { answer, passedThrough } = await callBash(handlers['tool.call'], dollar, bashCall('git push --force origin main'))
  expect((answer as any).deny).toContain('git push refused')
  expect(passedThrough).toBeNull()
})

test("an unmarked session's push reaches the tool untouched", async () => {
  const { handlers } = mounted()
  const { dollar } = fakeDollar({})                       // no marker: the operator's own session
  const e = bashCall('git push --force origin main')
  const { answer, passedThrough } = await callBash(handlers['tool.call'], dollar, e)
  expect(passedThrough).toBe(e)
  expect(answer).toBe(e)
})

test('a handler that cannot read its marker lets the call through and logs one line', async () => {
  const { handlers } = mounted()
  const { dollar, written } = fakeDollar({ noEnv: true })
  const e = bashCall('git push --force origin main')
  const { answer } = await callBash(handlers['tool.call'], dollar, e)
  expect(answer).toBe(e)
  expect(written.length).toBe(1)
  expect(written[0]).toContain('| guards |')
})
