// hooks/tests/supervision.test.ts
// The shared store: the key per session id, the merge that keeps two sessions
// writing at once from losing a row (Review Focus 4 — the keys are per session
// id, one file each, so a concurrent write to another key cannot be lost), the
// end that removes the row, and the wiring over a faked $ — the figures from
// the gauge's own module memory through the composed register (the gauge
// mounted first, or the row runs one measure behind), the name through the
// walk's core over this test's own readers, the repository through its own
// origin read.
import { expect, test } from 'claude-code/testing'
import {
  writeSession, readSessions, deleteSession, sessionKey, parseSessionRow,
} from '../supervision.ts'
import { register } from '../register.ts'

const HOME = '/tmp/h'
const STATE = `${HOME}/.claude/claude-orchestrator`
const SESSIONS = `${STATE}/store/sessions`
const LOG = `${STATE}/hooks-module.log`
const PROJECTS = `${HOME}/.claude/projects`

// --- the store's mechanics ----------------------------------------------------------------

test('the key is per session id', () => {
  expect(sessionKey('abc')).toBe('sessions/abc')
})

// The harness hands a test a $ of its own, reduced — neither fs nor process
// among its nouns — so the store is exercised over a complete fake: an
// in-memory file map (one file per key, the store's own layout) and recorded
// runs, the convention every wiring test in this suite follows.
type Fx = {
  dollar: any
  files: Map<string, string>
  ran: string[]
  written: string[]
  usage: { context: { tokens: number; window: number; percent: number } }
}

function fakeDollar(over: {
  launchName?: string | null
  origin?: string
  transcript?: string
} = {}): Fx {
  const files = new Map<string, string>()
  const ran: string[] = []
  const written: string[] = []
  const usage = { context: { tokens: 30000, window: 100000, percent: 30 } }
  const env: Record<string, string> = { HOME }
  if (over.transcript !== undefined) files.set(`${PROJECTS}/-a-project/s-one.jsonl`, over.transcript)
  const dollar = {
    session: {
      id: async () => 's-one',
      usage: async () => usage,
      model: async () => 'a-model',
      surfaces: async () => [],
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
        if (argv[0] === 'sh') return { exitCode: 0, stdout: '123 ttys001\n', stderr: '' }
        if (argv[0] === 'ps' && argv[1] === '-t') {
          // The session's own process, as the listing prints it.
          const name = over.launchName === null ? null : (over.launchName ?? 'Agent : belt-p3')
          return { exitCode: 0, stdout: name ? `  501 hostcli --name ${name}\n` : '  501 hostcli\n', stderr: '' }
        }
        if (argv[0] === 'git' && argv[1] === 'remote') {
          return over.origin ? { exitCode: 0, stdout: `${over.origin}\n`, stderr: '' } : { exitCode: 128, stdout: '', stderr: 'no origin' }
        }
        if (argv[0] === 'dd') {
          const flag = (name: string) => argv.find(a => a.startsWith(`${name}=`))?.split('=')[1]
          const bs = Number(flag('bs')), skip = Number(flag('skip')), count = Number(flag('count'))
          const text = files.get(argv[1]?.slice('if='.length) ?? '') ?? over.transcript ?? ''
          return { exitCode: 0, stdout: text.slice(skip * bs, (skip + count) * bs), stderr: '' }
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
    ui: { toast: () => undefined, invalidate: () => undefined },
  }
  return { dollar, files, ran, written, usage }
}

test('two sessions writing at once keep both rows', async () => {
  // Review Focus 4: the writes go to two keys — two files — so neither merge
  // can read, overwrite or lose the other's row, whatever the interleaving.
  const { dollar } = fakeDollar()
  await Promise.all([
    writeSession(dollar, 'first', { role: 'agent', context_percent: 40 }),
    writeSession(dollar, 'second', { role: 'agent', context_percent: 55 }),
  ])
  const rows = await readSessions(dollar)
  expect(rows['sessions/first'].context_percent).toBe(40)
  expect(rows['sessions/second'].context_percent).toBe(55)
})

test('a session end removes its row', async () => {
  const { dollar } = fakeDollar()
  await writeSession(dollar, 'gone', { role: 'agent', context_percent: 10 })
  await deleteSession(dollar, 'gone')
  expect((await readSessions(dollar))['sessions/gone']).toBeUndefined()
})

test('a patch merges into the row it finds, and the write stamps it', async () => {
  const { dollar } = fakeDollar()
  await writeSession(dollar, 's', {
    role: 'agent', name: 'Agent : one', context_percent: 30,
    context_tokens: 30000, window: 100000, model: 'a-model', busy: false,
  })
  await writeSession(dollar, 's', { context_percent: 55 })
  const row = (await readSessions(dollar))['sessions/s']
  expect(row.context_percent).toBe(55)
  expect(row.name).toBe('Agent : one')
  expect(Date.now() - Date.parse(row.updated_at)).toBeLessThan(60000)
})

test('a row older than one hour is dropped, a fresh one kept', async () => {
  const { dollar } = fakeDollar()
  await writeSession(dollar, 'old', { role: 'agent', updated_at: new Date(Date.now() - 3600000 - 5000).toISOString() })
  await writeSession(dollar, 'new', { role: 'agent' })
  const rows = await readSessions(dollar)
  expect(rows['sessions/old']).toBeUndefined()
  expect(rows['sessions/new']).toBeDefined()
})

test('an absent, empty or unparseable row file is no row', async () => {
  // The measure-file doctrine, the store's own: a partial write is data that
  // parses to nothing, and the end handler's truncated files read as absent.
  expect(parseSessionRow('')).toBeNull()
  expect(parseSessionRow('{"role":"agent","context_perc')).toBeNull()
  expect(parseSessionRow('not json')).toBeNull()
  expect(parseSessionRow(JSON.stringify({ role: 'agent' }))).toBeNull()
  const { dollar, files } = fakeDollar()
  files.set(`${SESSIONS}/broken`, 'not json\n')
  files.set(`${SESSIONS}/empty`, '')
  const rows = await readSessions(dollar)
  expect(rows['sessions/broken']).toBeUndefined()
  expect(rows['sessions/empty']).toBeUndefined()
})

// --- the wiring ---------------------------------------------------------------------------

// The composed chain, one list per event: a domain's handler answers after the
// ones registered before it, the engine's own order, so driving the list in
// registration order is driving the chain the host drives.
function mounted(registerAll: (on: any) => void): Record<string, Function[]> {
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

test('the composed register writes the row the gauge just measured', async () => {
  // Two measures, 30 then 55: the row carries the second figure only because
  // register mounts the gauge before the supervision — reversed, its handler
  // would answer first and read the reading one measure behind (nothing, then
  // 30). The order is pinned here, not by courtesy.
  const chains = mounted(register)
  const fx = fakeDollar({ origin: 'git@github.com:me/belt.git' })
  await drive(chains, 'session.measure', fx.dollar, {})
  fx.usage.context.percent = 55
  fx.usage.context.tokens = 55000
  await drive(chains, 'session.measure', fx.dollar, {})
  const row = (await readSessions(fx.dollar))['sessions/s-one']
  expect(row.context_percent).toBe(55)
  expect(row.context_tokens).toBe(55000)
  expect(row.window).toBe(100000)
  expect(row.model).toBe('a-model')
  expect(row.busy).toBe(false)
  expect(row.role).toBe('agent')
  expect(row.name).toBe('Agent : belt-p3')
  expect(row.repo).toBe('me/belt')
})

test('without a launch name the row is named by the transcript\'s last rename', async () => {
  const renamed = [
    '{"type":"assistant","message":{"role":"assistant","content":"an answer"}}',
    '{"type":"custom-title","customTitle":"Agent : renamed"}',
  ].join('\n') + '\n'
  const chains = mounted(register)
  const fx = fakeDollar({ launchName: null, transcript: renamed })
  await drive(chains, 'session.measure', fx.dollar, {})
  const row = (await readSessions(fx.dollar))['sessions/s-one']
  expect(row.name).toBe('Agent : renamed')
  expect(row.role).toBe('agent')
})

test('the end handler removes the row through the store', async () => {
  const chains = mounted(register)
  const fx = fakeDollar()
  await writeSession(fx.dollar, 's-one', { role: 'agent' })
  await drive(chains, 'session.end', fx.dollar, { sessionId: 's-one' })
  expect(fx.files.get(`${SESSIONS}/s-one`)).toBe('')
  expect((await readSessions(fx.dollar))['sessions/s-one']).toBeUndefined()
})

test('a row that cannot be written never blocks the measure, and is said', async () => {
  const chains = mounted(register)
  const fx = fakeDollar()
  await drive(chains, 'session.measure', fx.dollar, {})
  const good = fx.dollar.fs.write
  fx.dollar.fs.write = async (p: string, text: string) => {
    if (p.startsWith(SESSIONS)) throw new Error('EIO: the store cannot be written')
    return good(p, text)
  }
  const e = {}
  const answer = await drive(chains, 'session.measure', fx.dollar, e)
  expect(answer).toBe(e)
  expect(fx.written.some(l => l.includes('| supervision |') && l.includes('EIO'))).toBe(true)
})
