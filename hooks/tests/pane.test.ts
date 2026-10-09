// hooks/tests/pane.test.ts
// The coordinator pane: the store's rows sorted by rotation urgency (past the
// gate first, then fill descending), the label the spec names (name, role, the
// fill against the gate, the reading's age), and the wiring over a faked $ —
// the pane opened on a coordinator's or orchestrator's session.start and on no
// other role nor where nothing draws, the render under the pane's own matcher
// drawing one Text row per entry, the measure's side reads bounded so a walk
// that cannot answer in time costs the row its name, never the measure.
import { expect, test } from 'claude-code/testing'
import { paneRows, register as registerSupervision, type SessionRow } from '../supervision.ts'
import { register as registerAll } from '../register.ts'

const HOME = '/tmp/h'
const SESSIONS = `${HOME}/.claude/claude-orchestrator/store/sessions`
const LOG = `${HOME}/.claude/claude-orchestrator/hooks-module.log`
const PROJECTS = `${HOME}/.claude/projects`

// --- the rows -------------------------------------------------------------------------------

test('rows sort by rotation urgency', () => {
  const rows = paneRows({
    'sessions/a': { role: 'agent', name: 'Agent : low', context_percent: 30, context_tokens: 30000, window: 100000, model: 'a-model', busy: false, updated_at: 't', repo: 'r' },
    'sessions/b': { role: 'agent', name: 'Agent : hot', context_percent: 85, context_tokens: 85000, window: 100000, model: 'a-model', busy: true, updated_at: 't', repo: 'r' },
  })
  expect(rows[0].label).toContain('Agent : hot')
  expect(rows[0].label).toContain('85%')
})

// A row with every figure a real measure writes, overridable field by field.
function row(over: {
  role?: SessionRow['role']
  name?: string | null
  repo?: string | null
  context_percent?: number
  context_tokens?: number
  window?: number
  busy?: boolean
  updated_at?: string
} = {}): SessionRow {
  return {
    // `in`, not `??`: a row may carry an explicit null role, and `??` would
    // read it back as the default agent.
    role: 'role' in over ? over.role : 'agent',
    name: 'name' in over ? over.name : null,
    repo: over.repo ?? null,
    context_percent: over.context_percent ?? 0,
    context_tokens: over.context_tokens ?? 0,
    window: over.window ?? 100000,
    model: 'a-model',
    busy: over.busy ?? false,
    updated_at: over.updated_at ?? new Date().toISOString(),
  }
}

test('a row past the token gate outranks a fuller row still below the percent gate', () => {
  // 35% of a 1,000,000 window is 350,000 tokens: past the gate the token half
  // trips, so it leads a session holding 50% of a 100,000 window.
  const rows = paneRows({
    'sessions/big': row({ context_percent: 35, context_tokens: 350000, window: 1000000 }),
    'sessions/small': row({ context_percent: 50, context_tokens: 50000, window: 100000 }),
  })
  expect(rows[0].label).toContain('35%')
  expect(rows[0].label).toContain('past the gate')
  expect(rows[1].label).toContain('50%')
  expect(rows[1].label).not.toContain('past the gate')
  expect(rows[0].urgency).toBeGreaterThan(rows[1].urgency)
})

test('on each side of the gate the fill descends', () => {
  const rows = paneRows({
    'sessions/low': row({ context_percent: 30 }),
    'sessions/mid': row({ context_percent: 50 }),
    'sessions/hot': row({ context_percent: 85 }),
    'sessions/full': row({ context_percent: 95 }),
  })
  const fills = rows.map(r => / (\d+)%/.exec(r.label)?.[1])
  expect(fills).toEqual(['95', '85', '50', '30'])
})

test('the label carries the name, the role, the fill against the gate and the reading age', () => {
  const rows = paneRows({
    'sessions/named': row({ name: 'Agent : one', context_percent: 30, updated_at: new Date(Date.now() - 65000).toISOString() }),
    'sessions/quiet': row({ role: null, updated_at: 't' }),
  })
  const named = rows.find(r => r.label.includes('Agent : one'))!
  expect(named.label).toContain('agent')
  expect(named.label).toContain('30%')
  expect(named.label).toContain('1m')
  expect(named.label).not.toContain('NaN')
  const quiet = rows.find(r => !r.label.includes('Agent : one'))!
  expect(quiet.label).toContain('unnamed')
  expect(quiet.label).toContain('no role')
  expect(quiet.label).not.toContain('NaN')
})

// --- the wiring -----------------------------------------------------------------------------

// The harness hands a test a $ of its own, reduced — neither fs nor process
// among its nouns — so the pane is exercised over a complete fake: an
// in-memory file map holding the store, recorded runs, a recorded ui.open.
type Fx = {
  dollar: any
  files: Map<string, string>
  ran: string[]
  written: string[]
  opened: object[]
  env: Record<string, string>
}

function fakeDollar(over: {
  launchName?: string | null
  origin?: string
  hangWalk?: boolean
} = {}): Fx {
  const files = new Map<string, string>()
  const ran: string[] = []
  const written: string[] = []
  const opened: object[] = []
  const env: Record<string, string> = { HOME }
  const dollar = {
    session: {
      id: async () => 's-one',
      usage: async () => ({ context: { tokens: 30000, window: 100000, percent: 30 } }),
      model: async () => 'a-model',
      surfaces: async () => ['terminal'],
    },
    env: { get: async (name: string) => env[name] },
    fs: {
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`ENOENT: ${p}`)
        return files.get(p)
      },
      write: async (p: string, text: string) => {
        if (p === LOG) written.push(text)
        else files.set(p, text)
      },
      stat: async (p: string) => {
        const text = files.get(p)
        if (text === undefined) throw new Error(`ENOENT: ${p}`)
        return { kind: 'file', size: text.length, mtimeMs: 0, isLink: false }
      },
      list: async (dir: string) => {
        const names = new Set<string>()
        for (const p of files.keys()) {
          if (!p.startsWith(`${dir}/`)) continue
          const rest = p.slice(dir.length + 1)
          if (rest) names.add(rest.split('/')[0])
        }
        return [...names].map(name => {
          const text = files.get(`${dir}/${name}`)
          return text !== undefined
            ? { name, kind: 'file', size: text.length, mtimeMs: 0, isLink: false }
            : { name, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }
        })
      },
      exists: async (p: string) => files.has(p),
    },
    process: {
      run: async (argv: readonly string[]) => {
        ran.push(argv.join(' '))
        if (argv[0] === 'sh') {
          if (over.hangWalk) return new Promise(() => undefined)
          return { exitCode: 0, stdout: '123 ttys001\n', stderr: '' }
        }
        if (argv[0] === 'ps' && argv[1] === '-t') {
          const name = over.launchName === null ? null : (over.launchName ?? 'Agent : belt-p3')
          return { exitCode: 0, stdout: name ? `  501 hostcli --name ${name}\n` : '  501 hostcli\n', stderr: '' }
        }
        if (argv[0] === 'git' && argv[1] === 'remote') {
          return over.origin ? { exitCode: 0, stdout: `${over.origin}\n`, stderr: '' } : { exitCode: 128, stdout: '', stderr: 'no origin' }
        }
        if (argv[0] === 'dd') {
          const flag = (name: string) => argv.find(a => a.startsWith(`${name}=`))?.split('=')[1]
          const bs = Number(flag('bs')), skip = Number(flag('skip')), count = Number(flag('count'))
          const text = files.get(argv[1]?.slice('if='.length) ?? '') ?? ''
          return { exitCode: 0, stdout: text.slice(skip * bs, (skip + count) * bs), stderr: '' }
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    ui: {
      open: async (pane: object) => {
        opened.push(pane)
        return { isPlaced: true }
      },
      toast: () => undefined,
      invalidate: () => undefined,
      resolve: (_e: unknown) => ({
        Box: (props: { flexDirection?: string; children?: unknown[] }) => ({ type: 'Box', props }),
        Text: (props: { color?: string; children?: string }) => ({ type: 'Text', props }),
      }),
    },
  }
  return { dollar, files, ran, written, opened, env }
}

function mounted(register: (on: any) => void): {
  handlers: Record<string, Function>
  matchers: Record<string, object | undefined>
} {
  const handlers: Record<string, Function> = {}
  const matchers: Record<string, object | undefined> = {}
  register((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    handlers[args[0]] = args[args.length - 1] as Function
    matchers[args[0]] = args.length === 3 ? args[1] : undefined
    return { catch: () => undefined }
  })
  return { handlers, matchers }
}

const through = (e: unknown) => ({ passed: e })
const startEvent = { cwd: '/tmp/w', surface: 'terminal', isInteractive: true }

test('the pane registers under its own render matcher, and the second session.start carries the empty matcher', () => {
  // The stored-matcher convention: a bare two-argument registration would pass
  // every test below while the engine drew the pane's rows into every Pane any
  // plugin opens. The matcher is spelled from the shipped types — the render
  // envelope's own component and requestId, the pane's id among them — and the
  // engine validates neither key, so the pin lives here.
  const { matchers } = mounted(registerSupervision)
  expect(matchers['ui.render']).toEqual({ component: 'Pane', requestId: 'supervision' })
  expect(matchers['session.start']).toEqual({})
})

test('a coordinator or orchestrator start opens the pane; an agent or a headless start never does', async () => {
  const { handlers } = mounted(registerSupervision)

  const coord = fakeDollar({ launchName: 'Coord : main' })
  const answered = await handlers['session.start'](coord.dollar, startEvent, through)
  expect(answered).toEqual({ passed: startEvent })
  expect(coord.opened).toEqual([{ id: 'supervision', title: 'Supervised sessions' }])

  const orch = fakeDollar({ launchName: 'Orch : phase-3' })
  await handlers['session.start'](orch.dollar, startEvent, through)
  expect(orch.opened.length).toBe(1)

  const agent = fakeDollar({ launchName: 'Agent : belt-p3' })
  await handlers['session.start'](agent.dollar, startEvent, through)
  expect(agent.opened).toEqual([])
  expect(agent.ran.length).toBeGreaterThan(0)

  // A session that draws nowhere yet (a -p run, the SDK) is answered without
  // the walk: no surface places the pane, and no later event re-offers it.
  const headless = fakeDollar()
  const quiet = { cwd: '/tmp/w', surface: null, isInteractive: false }
  await handlers['session.start'](headless.dollar, quiet, through)
  expect(headless.opened).toEqual([])
  expect(headless.ran).toEqual([])
})

test('the pane draws one Text row per store entry, the urgent first and warned', async () => {
  const { handlers } = mounted(registerSupervision)
  const fx = fakeDollar()
  fx.files.set(`${SESSIONS}/low`, JSON.stringify(row({ name: 'Agent : low', context_percent: 30 })) + '\n')
  fx.files.set(`${SESSIONS}/hot`, JSON.stringify(row({ name: 'Agent : hot', context_percent: 85 })) + '\n')
  const e = { surface: 'terminal', component: 'Pane', requestId: 'supervision', props: {} }
  const tree = await handlers['ui.render'](fx.dollar, e, through)
  const text = JSON.stringify(tree)
  expect(text).toContain('Agent : hot')
  expect(text).toContain('Agent : low')
  expect(text).toContain('85%')
  expect(text.indexOf('Agent : hot')).toBeLessThan(text.indexOf('Agent : low'))
  expect(text.match(/"color":"warning"/g)?.length).toBe(1)

  // An empty store is an empty column, not a passed-through render.
  const bare = fakeDollar()
  const empty = await handlers['ui.render'](bare.dollar, e, through)
  expect(JSON.stringify(empty)).toContain('Box')
  expect(JSON.stringify(empty)).not.toContain('Text')
})

test('a render that cannot resolve its surface is said and draws nothing of its own', async () => {
  const { handlers } = mounted(registerSupervision)
  const fx = fakeDollar()
  fx.files.set(`${SESSIONS}/hot`, JSON.stringify(row({ name: 'Agent : hot', context_percent: 85 })) + '\n')
  fx.dollar.ui.resolve = () => {
    throw new Error('no element table for this surface')
  }
  const e = { surface: 'terminal', component: 'Pane', requestId: 'supervision', props: {} }
  const answer = await handlers['ui.render'](fx.dollar, e, through)
  expect(answer).toEqual({ passed: e })
  expect(fx.written.some(l => l.includes('| supervision |') && l.includes('no element table'))).toBe(true)
})

// The composed chain, one list per event, driven in registration order — the
// order the host drives the chain itself.
function composedChains(): Record<string, Function[]> {
  const chains: Record<string, Function[]> = {}
  registerAll((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    ;(chains[args[0]] ??= []).push(args[args.length - 1] as Function)
    return { catch: () => undefined }
  })
  return chains
}

async function drive(chains: Record<string, Function[]>, event: string, dollar: any, e: object) {
  const run = async (i: number, ev: any): Promise<any> =>
    i >= (chains[event] ?? []).length ? ev : chains[event][i](dollar, ev, (x: any) => run(i + 1, x))
  return run(0, e)
}

test('a name walk that cannot answer in time costs the row its name, never the measure', async () => {
  // The Task 9 review's bounded-reads carry: the measure's side reads run
  // under their own deadline, and one that loses the race is quietly no name —
  // the figures still land, the measure still answers.
  const chains = composedChains()
  const fx = fakeDollar({ hangWalk: true, origin: 'git@github.com:me/belt.git' })
  fx.env.ORCHESTRATOR_SIDE_READ_MS = '50'
  const e = {}
  const answered = await drive(chains, 'session.measure', fx.dollar, e)
  expect(answered).toBe(e)
  const stored = JSON.parse(String(fx.files.get(`${SESSIONS}/s-one`)))
  expect(stored.name).toBeNull()
  expect(stored.role).toBeNull()
  expect(stored.repo).toBe('me/belt')
  expect(stored.context_percent).toBe(30)
  expect(stored.model).toBe('a-model')
})
