// hooks/tests/stop-gate.test.ts
// The stop gate's boundaries: the decision shapes (the module's own `block` field for the
// classic decision, the summary-level wake decision, the deadline race), the ported checks
// (the wake walk, the once-per-tell CI read over ci-watch's precomputed logs), and the
// wiring over a faked $ — every field the classic.Stop event really carries pinned by a
// test that fails under the wrong spelling. The refusal texts are stop_gate.py's, verbatim
// where the data source did not change beneath them.
import { expect, test } from 'claude-code/testing'
import {
  refuse, wakeDecision, withDeadline, isDegradedPass,
  machineLine, readHeads, writeHeads, headsPath, listing, ownAgents, openRows,
  projectCheckouts, watchedNumbers, parseCiWatchLog, watchNumberOf, pullRequestOf,
  checkWake, checkWakeDone, checkCi,
} from '../stop-gate.ts'
import { register as registerGuards } from '../guards.ts'

// --- the decision shapes -----------------------------------------------------------------

test('a refusal is the documented shape', () => {
  // The shipped types map the classic decision `{"decision":"block","reason":…}` onto the
  // module's own field: `block` carries the reason text (ClassicResult — the doc on `block`
  // names the decision it answers). A `decision` field is a wrong shape on classic.Stop
  // and the hook is skipped, so the stop would never be held; the types are the authority.
  expect(refuse('an agent of yours is still busy')).toEqual({ block: 'an agent of yours is still busy' })
})

test('a summary with nothing holding the stop passes', () => {
  expect(wakeDecision({ busyOwnAgents: [], blockingQuestion: null, openRows: [] })).toEqual({ decision: 'pass' })
})

test('a busy own agent releases the stop — its idle notice will wake the orchestrator', () => {
  // Declared deviation from the brief's sketch, which expected 'block': stop_gate.py:363-364
  // returns the moment one of its own agents is busy, the shell wrapper's own header names
  // the busy agent first among the things that release the hold, and the design doc lists
  // it among the wake conditions. Inverting it here would refuse every stop an agent
  // survives — the opposite of the ported gate.
  expect(wakeDecision({ busyOwnAgents: ['Agent : belt-p3'], blockingQuestion: null, openRows: [] })).toEqual({ decision: 'pass' })
})

test('a blocking question declared on the last line releases the stop', () => {
  expect(wakeDecision({ busyOwnAgents: [], blockingQuestion: 'the operator', openRows: [] }).decision).toBe('pass')
})

test('an open dispatch row holds the stop and names the row', () => {
  const d = wakeDecision({ busyOwnAgents: [], blockingQuestion: null, openRows: ['r-12 (the report row)'] })
  expect(d.decision).toBe('block')
  expect((d as { reason: string }).reason).toBe('Not done: row r-12 (the report row) is open. Dispatch it, close it, or say what blocks it.')
})

test('a CI read that exceeds its time bound degrades to pass-and-log', async () => {
  const slow = new Promise((resolve) => setTimeout(resolve, 250))
  const outcome = await withDeadline(slow, 10)
  expect(outcome.decision).toBe('pass')
})

test('the read that wins the race is answered as itself, and the degraded pass is told apart', async () => {
  const outcome = await withDeadline(Promise.resolve('the launcher said'), 10)
  expect(outcome).toBe('the launcher said')
  expect(isDegradedPass(outcome)).toBe(false)
  expect(isDegradedPass(await withDeadline(new Promise(() => undefined), 10))).toBe(true)
})

// --- the ported parsers ------------------------------------------------------------------

test('the machine line is read through whatever markup wraps it', () => {
  expect(machineLine('a report\n`waiting: operator — blocks: the report`.')).toBe('waiting: operator — blocks: the report')
  expect(machineLine('> waiting: done')).toBe('waiting: done')
  expect(machineLine('- *waiting: done*')).toBe('waiting: done')
  expect(machineLine('Waiting:  operator – blocks: x')).toBe('Waiting:  operator – blocks: x')
  expect(machineLine('waiting: operator-blocks: stand-by')).toBe('waiting: operator-blocks: stand-by')
})

test('the listing parses the launcher rows and drops the marks', () => {
  const rows = listing('w1/t1 | /dev/ttys001 | a title | Orch : belt | self\nw1/t2 | /dev/ttys002 | ⠋ Agent : belt | Agent : belt-p3 | hidden\nnot a row\n')
  expect(rows).toEqual([
    { tty: '/dev/ttys001', title: 'a title', name: 'Orch : belt' },
    { tty: '/dev/ttys002', title: '⠋ Agent : belt', name: 'Agent : belt-p3' },
  ])
})

test('own agents are the owner entries that still run one, residents apart', () => {
  const rows = listing('w1/t2 | /dev/ttys002 | ⠋ Agent : belt | Agent : belt-p3\nw1/t3 | /dev/ttys003 | ✳ Agent : idle | Agent : idle-p3\nw1/t4 | /dev/ttys004 | ✳ Agent : resident | Agent : resident-p3\nw1/t5 | /dev/ttys005 | a plain shell | (host default)\n')
  const entries = [
    { tab_id: 'T1', tty: '/dev/ttys002', owner: '17' },
    { tab_id: 'T2', tty: '/dev/ttys003', owner: '17' },
    { tab_id: 'T3', tty: '/dev/ttys004', owner: '17', resident: true },
    { tab_id: 'T4', tty: '/dev/ttys005', owner: '17' },
    { tab_id: 'T5', tty: '/dev/ttys006', owner: 'someone-else' },
  ]
  const { agents, resident } = ownAgents(rows, entries, '17')
  expect(agents).toEqual([
    { label: 'Agent : belt-p3', state: 'busy', tty: '/dev/ttys002' },
    { label: 'Agent : idle-p3', state: 'idle', tty: '/dev/ttys003' },
  ])
  expect(resident).toBe(true)
  // With no owner known, no entry is counted: a recycled tty's occupant would be.
  expect(ownAgents(rows, entries, '').agents).toEqual([])
})

test('a pull request is read from the branch and the answer, or not at all', () => {
  expect(pullRequestOf('feat/belt', '{"number":160,"state":"OPEN"}')).toEqual({ number: '160', state: 'OPEN' })
  expect(pullRequestOf(null, '{"number":160,"state":"OPEN"}')).toBeNull()
  expect(pullRequestOf('feat/belt', null)).toBeNull()
  expect(pullRequestOf('feat/belt', 'not json')).toBeNull()
})

test('open rows are the records still open, one per register path', () => {
  expect(openRows([
    '{"id":"r-12","label":"the report row","state":"open"}\n{"id":"r-13","state":"closed"}\n',
    'not json\n{"id":"r-14","state":"open"}\n',
  ])).toEqual(['r-12 (the report row)', 'r-14 (no label)'])
})

test('the checkouts of the project are the workspace rows under its name', () => {
  const out = '/tmp/h/work/repo/belt | feat/belt | abc1234 | clean | pushed\n/tmp/h/work/other/x | feat/x | def | clean | pushed\n/tmp/h/work/repo | main | fed | clean | pushed\n'
  expect(projectCheckouts('/tmp/h/work/repo', out)).toEqual(['/tmp/h/work/repo/belt'])
})

test('the watched numbers are the live ci-watch processes alone', () => {
  const ps = [
    '  501 hostcli',
    '  /bin/bash /plugins/orch-root/skills/orchestrator/scripts/ci-watch.sh 160',
    '  sh -c grep ci-watch.sh 12',
    '  zsh -x /plugins/orch-root/skills/orchestrator/scripts/ci-watch.sh 161',
    '  /bin/bash /plugins/orch-root/skills/orchestrator/scripts/ci-watch.sh --help',
  ].join('\n')
  expect(watchedNumbers(ps)).toEqual(new Set(['160', '161']))
})

test('a ci-watch log is read as the last bucket each check carries', () => {
  const text = 'build\tpending\t0\tu\r\nbuild\tpending\t9\tu\ntest\tfail\t30\tu\nnot a table line\n'
  expect(parseCiWatchLog(text)).toEqual({ build: 'pending', test: 'fail' })
  expect(parseCiWatchLog('')).toEqual({})
})

test('the pull request number is the log name, the base watches apart', () => {
  expect(watchNumberOf('here-pr160.log')).toBe('160')
  expect(watchNumberOf('owner_repo-pr12.log')).toBe('12')
  expect(watchNumberOf('here-pr160-base.log')).toBeNull()
  expect(watchNumberOf('notes.txt')).toBeNull()
})

// --- the heads record --------------------------------------------------------------------

test('a heads record reads and writes the same line', () => {
  const text = '160 1728000000000 pending build,test\n170 abc123 done\n'
  const heads = readHeads(text)
  expect(heads.get('160')).toEqual(['1728000000000', 'pending', new Set(['build', 'test'])])
  expect(heads.get('170')).toEqual(['abc123', 'done', new Set()])
  expect(writeHeads(heads)).toBe(text)
  // A two-field line, written by the previous shape, reads as done; a bad state is skipped.
  expect(readHeads('170 abc123\n').get('170')).toEqual(['abc123', 'done', new Set()])
  expect(readHeads('170 abc123 weird x\n').size).toBe(0)
})

test('the heads path is per session and sanitised', () => {
  expect(headsPath('/tmp/h/state', 'a1b2c3')).toBe('/tmp/h/state/stop-gate/a1b2c3.mheads')
  expect(headsPath('/tmp/h/state', 'a/1 b')).toBe('/tmp/h/state/stop-gate/a_1_b.mheads')
})

// --- check 1 -----------------------------------------------------------------------------

const AGENT_BUSY = { label: 'Agent : belt-p3', state: 'busy' as const, tty: '/dev/ttys002' }
const AGENT_IDLE = { label: 'Agent : idle-p3', state: 'idle' as const, tty: '/dev/ttys003' }

test('an idle agent delivered of its pull request refuses before anything else', () => {
  const held = checkWake({
    agents: [AGENT_IDLE, AGENT_BUSY], resident: false,
    delivered: ['Agent : idle-p3 (pull request #160, OPEN)'], message: 'anything',
  })
  expect(held).toEqual({
    case: 'idle-delivered',
    reason: 'Idle with its pull request open or merged: Agent : idle-p3 (pull request #160, OPEN). Stand it down now — or, if it waits on a question you have not answered, answer it.',
  })
})

test('a busy agent passes, the blocks line passes, the done line asks for the facts', () => {
  expect(checkWake({ agents: [AGENT_BUSY], resident: false, delivered: [], message: 'done?' })).toBeNull()
  expect(checkWake({ agents: [], resident: false, delivered: [], message: 'x\n`waiting: operator — blocks: the report`.' }))
    .toEqual({ blocks: 'the report' })
  expect(checkWake({ agents: [], resident: false, delivered: [], message: 'waiting: done' })).toBe('read-what-is-left')
})

test('the done line holds the stop on what is left and on open rows', () => {
  expect(checkWakeDone({ agents: [], checkouts: [], deferred: [] })).toBeNull()
  expect(checkWakeDone({
    agents: [AGENT_IDLE], checkouts: ['/tmp/h/work/repo/belt'], deferred: ['r-12 (the report row)'],
  })).toEqual({
    case: 'not-done',
    reason: 'Not done: /tmp/h/work/repo/belt, Agent : idle-p3 are still there. Finish them, or say what blocks them. '
      + 'Not done: row r-12 (the report row) is open. Dispatch it, close it, or say what blocks it.',
  })
})

test('the remaining cases refuse each with their own text', () => {
  expect(checkWake({ agents: [AGENT_IDLE], resident: false, delivered: [], message: 'I stopped.' })).toEqual({
    case: 'idle-agents', reason: 'Agent : idle-p3 is idle: its notice was spent. Read its report or relaunch it.',
  })
  expect(checkWake({ agents: [], resident: false, delivered: [], message: 'waiting: operater blocks x' })).toEqual({
    case: 'malformed-machine-line',
    reason: 'Your last line is not the machine line: end the message with the line waiting: operator — blocks: <what it blocks>, or with waiting: done, as the message\'s last line, no markup.',
  })
  expect(checkWake({ agents: [], resident: false, delivered: [], message: 'waiting: your call?' })).toEqual({
    case: 'question-without-blocks',
    reason: 'Your question blocks nothing declared: advance everything that can advance; its answer will come in a later turn.',
  })
  expect(checkWake({ agents: [], resident: true, delivered: [], message: 'stopped.' })).toBeNull()
  expect(checkWake({ agents: [], resident: false, delivered: [], message: 'stopped.' })).toEqual({
    case: 'nothing-will-wake',
    reason: 'Nothing will wake you: no agent of yours is running. Launch what you announced, or, if a question truly blocks, end with the line waiting: operator — blocks: <what it blocks>, or with waiting: done. The line goes as the message\'s last line, no markup.',
  })
})

// --- check 2 -----------------------------------------------------------------------------

const CI_WATCH = '/plugins/orch-root/skills/orchestrator/scripts/ci-watch.sh'
const ciLog = (tell: string, checks: readonly { name: string; bucket: string }[]) => ({ number: '160', tell, checks })

test('a pending head is told once, again only for a failing set not yet told', () => {
  const run = (log: ReturnType<typeof ciLog>, reported: Map<string, unknown>, watched = new Set<string>(), ignored = new Set<string>()) =>
    checkCi({ logs: [log], reported: reported as any, watched, ignored, watchCommand: CI_WATCH })
  const pending = ciLog('t1', [{ name: 'build', bucket: 'pending' }])
  const first = run(pending, readHeads(''))
  expect(first.lines.length).toBe(1)
  expect(first.lines[0]).toContain('#160')
  expect(first.lines[0]).toContain('1 checks pending (build)')
  expect(first.lines[0]).toContain(CI_WATCH + ' 160')
  // The next stop knows it was told: the same state says nothing.
  const told = run(pending, first.heads)
  expect(told.lines).toEqual([])
  // A failing set it has not been told refuses again and is recorded.
  const failing = ciLog('t1', [{ name: 'build', bucket: 'fail' }, { name: 'test', bucket: 'fail' }])
  const again = run(failing, told.heads)
  expect(again.lines.length).toBe(1)
  expect(again.lines[0]).toContain('2 failing (build, test)')
  // A moved tell starts over.
  const moved = run(ciLog('t2', [{ name: 'build', bucket: 'pending' }]), again.heads)
  expect(moved.lines.length).toBe(1)
})

test('a watched pull request is waited for, and nothing is recorded for it', () => {
  const outcome = checkCi({
    logs: [ciLog('t1', [{ name: 'build', bucket: 'pending' }])], reported: readHeads(''),
    watched: new Set(['160']), ignored: new Set(), watchCommand: CI_WATCH,
  })
  expect(outcome.lines).toEqual([])
  expect(outcome.heads.size).toBe(0)
})

test('a head with no checks read is unread, and ignored checks filter nothing else out', () => {
  const unread = checkCi({ logs: [ciLog('t1', [])], reported: readHeads(''), watched: new Set(), ignored: new Set(), watchCommand: CI_WATCH })
  expect(unread.lines).toEqual([])
  expect(unread.heads.size).toBe(0)
  const ignored = checkCi({
    logs: [ciLog('t1', [{ name: 'build', bucket: 'fail' }])], reported: readHeads(''),
    watched: new Set(), ignored: new Set(['build']), watchCommand: CI_WATCH,
  })
  expect(ignored.lines).toEqual([])
})

// --- the wiring --------------------------------------------------------------------------

const HOME = '/tmp/h'
const STATE = `${HOME}/.claude/claude-orchestrator`
const LOG = `${STATE}/hooks-module.log`
const CHAIN = `${STATE}/chains/ttys001.jsonl`
const REGISTER = `${STATE}/records/a1b2c3`
const RECORD = '/tmp/h/rec/round.jsonl'
const HEADS = `${STATE}/stop-gate/a1b2c3.mheads`
const CIDIR = `${STATE}/ci-watch`
const PROJECTS = `${HOME}/.claude/projects`
const TRANSCRIPT = `${HOME}/elsewhere/s-stop.jsonl`
const LAUNCHER = '/plugins/orch-root/skills/iterm-agents/scripts/iterm-agent.sh'
const WORKSPACE = '/plugins/orch-root/skills/orchestrator/scripts/workspace.sh'

const BUSY_ROW = 'w1/t2 | /dev/ttys002 | ⠋ Agent : belt | Agent : belt-p3'
const IDLE_ROW = 'w1/t3 | /dev/ttys003 | ✳ Agent : idle | Agent : idle-p3'
const OWNED = '{"tab_id":"T1","tty":"/dev/ttys002","owner":"17"}\n'

type Setup = {
  transcript?: string
  noLaunchName?: boolean
  launchName?: string
  chain?: string
  listing?: string
  records?: string[]
  heads?: string
  ciLogs?: Record<string, { mtimeMs: number; text: string }>
  ps?: string
  agentCwd?: string
  agentBranch?: string
  prAnswer?: string
  workspace?: string
  top?: string
  env?: Record<string, string>
  hangListing?: boolean
  failCiList?: boolean
}

function fakeDollar(setup: Setup): { dollar: any; written: string[]; ran: string[]; wrote: Record<string, string> } {
  const written: string[] = []
  const ran: string[] = []
  const wrote: Record<string, string> = {}
  const env = {
    HOME, CLAUDE_PLUGIN_ROOT: '/plugins/orch-root', ITERM_SESSION_ID: 'w0t0:2:17',
    ORCHESTRATOR_HOST_CLI: 'hostcli', ...(setup.env ?? {}),
  }
  const dollar = {
    env: { get: async (name: string) => env[name] },
    fs: {
      read: async (p: string) => {
        if (p === CHAIN) return setup.chain ?? ''
        if (p === REGISTER) return setup.records ? `${RECORD}\n` : ''
        if (p === RECORD) return (setup.records ?? [])[0] ?? ''
        if (p === HEADS) return setup.heads ?? ''
        if (p === LOG) return ''
        if (p.startsWith(`${CIDIR}/`)) return setup.ciLogs?.[p.slice(CIDIR.length + 1)]?.text ?? ''
        // The ignored-checks file is absent: the same answer a missing file gives.
        if (p === `${STATE}/ignored-checks`) throw new Error(`ENOENT: ${p}`)
        throw new Error(`unread: ${p}`)
      },
      write: async (p: string, text: string) => {
        if (p === LOG) written.push(text)
        else wrote[p] = text
      },
      stat: async (p: string) => {
        if (p === TRANSCRIPT && setup.transcript !== undefined) {
          return { kind: 'file', size: setup.transcript.length, mtimeMs: 0, isLink: false }
        }
        throw new Error('ENOENT')
      },
      list: async (p: string) => {
        if (p === CIDIR) {
          if (setup.failCiList) throw new Error('the ci-watch directory cannot be read')
          return Object.entries(setup.ciLogs ?? {}).map(([name, log]) => (
            { name, kind: 'file', size: log.text.length, mtimeMs: log.mtimeMs, isLink: false }
          ))
        }
        if (p === PROJECTS) return []
        return []
      },
      exists: async () => false,
    },
    process: {
      run: async (argv: readonly string[]) => {
        ran.push(argv.join(' '))
        if (argv[0] === 'sh') {
          return { exitCode: 0, stdout: '123 ttys001\n', stderr: '' }
        }
        if (argv[0] === 'ps' && argv[1] === '-t' && argv[2] === 'ttys001') {
          // The session's own process, as the listing prints it.
          return { exitCode: 0, stdout: setup.noLaunchName ? '  501 hostcli\n' : `  501 hostcli --name ${setup.launchName ?? 'Orch : belt'}\n`, stderr: '' }
        }
        if (argv[0] === 'ps' && argv[1] === '-t' && argv[2] === 'ttys003') {
          // The idle agent's host process: its pid, then its working directory.
          return { exitCode: 0, stdout: '   77 hostcli\n', stderr: '' }
        }
        if (argv[0] === 'ps') return { exitCode: 0, stdout: setup.ps ?? '1 ??\n', stderr: '' }
        if (argv[0] === 'lsof') {
          return { exitCode: 0, stdout: `p77\nn${setup.agentCwd ?? '/tmp/h/work/belt'}\n`, stderr: '' }
        }
        if (argv[0] === 'git' && argv[3] === 'symbolic-ref') {
          return setup.agentBranch ? { exitCode: 0, stdout: setup.agentBranch, stderr: '' } : { exitCode: 1, stdout: '', stderr: '' }
        }
        if (argv[0] === 'git' && argv[3] === 'rev-parse') {
          return argv[2] === '/tmp/h/work/repo' && setup.top
            ? { exitCode: 0, stdout: `${setup.top}\n`, stderr: '' }
            : { exitCode: 128, stdout: '', stderr: '' }
        }
        if (argv[0] === 'gh') {
          return setup.prAnswer ? { exitCode: 0, stdout: setup.prAnswer, stderr: '' } : { exitCode: 1, stdout: '', stderr: 'no answer' }
        }
        if (argv[0] === 'bash' && argv[1] === LAUNCHER) {
          if (setup.hangListing) return new Promise(() => undefined)
          return { exitCode: 0, stdout: setup.listing ?? '', stderr: '' }
        }
        if (argv[0] === 'bash' && argv[1] === WORKSPACE) return { exitCode: 0, stdout: setup.workspace ?? '', stderr: '' }
        if (argv[0] === 'dd') {
          const flag = (name: string) => argv.find(a => a.startsWith(`${name}=`))?.split('=')[1]
          const bs = Number(flag('bs')), skip = Number(flag('skip')), count = Number(flag('count'))
          const text = setup.transcript ?? ''
          return { exitCode: 0, stdout: text.slice(skip * bs, (skip + count) * bs), stderr: '' }
        }
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    },
  }
  return { dollar, written, ran, wrote }
}

function mounted(): { handlers: Record<string, Function>; matchers: Record<string, object | undefined> } {
  const handlers: Record<string, Function> = {}
  const matchers: Record<string, object | undefined> = {}
  registerGuards((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    handlers[args[0]] = args[args.length - 1] as Function
    matchers[args[0]] = args.length === 3 ? args[1] : undefined
    // The engine's on returns a registration taking one .catch; the fake accepts it and
    // drops it — the body's own catch is what the wiring tests.
    return { catch: () => undefined }
  })
  return { handlers, matchers }
}

const stopEvent = (over: Record<string, unknown> = {}) => ({
  hook_event_name: 'Stop',
  session_id: 'a1b2c3',
  transcript_path: TRANSCRIPT,
  cwd: '/tmp/h/work/repo',
  stop_hook_active: false,
  last_assistant_message: 'stopped.',
  ...over,
})

async function stop(handler: Function, dollar: any, e: object) {
  let passed: unknown = null
  const answer = await handler(dollar, e, (x: unknown) => { passed = x; return x })
  return { answer, passed }
}

test('the stop gate mounts on classic.Stop with no matcher', () => {
  const { handlers, matchers } = mounted()
  expect(typeof handlers['classic.Stop']).toBe('function')
  expect(matchers['classic.Stop']).toBeUndefined()
})

test('a stop already refused this turn is left alone, nothing read', async () => {
  const { handlers } = mounted()
  const { dollar, ran } = fakeDollar({})
  const e = stopEvent({ stop_hook_active: true })
  const { answer, passed } = await stop(handlers['classic.Stop'], dollar, e)
  expect(passed).toBe(e)
  expect(answer).toBe(e)
  expect(ran.length).toBe(0)
})

test('a session that is no orchestrator stops untouched, the launcher never asked', async () => {
  const { handlers } = mounted()
  const { dollar, ran } = fakeDollar({ launchName: 'Agent : belt' })
  const e = stopEvent({})
  const { answer } = await stop(handlers['classic.Stop'], dollar, e)
  expect(answer).toBe(e)
  expect(ran.filter(l => l.includes('iterm-agent.sh')).length).toBe(0)
})

test('a busy own agent releases the stop, no pull request read for it', async () => {
  const { handlers } = mounted()
  const { dollar, ran } = fakeDollar({ listing: BUSY_ROW, chain: OWNED })
  const e = stopEvent({})
  const { answer, passed } = await stop(handlers['classic.Stop'], dollar, e)
  expect(passed).toBe(e)
  expect(answer).toBe(e)
  expect(ran.filter(l => l.startsWith('gh')).length).toBe(0)
})

test('a stop with nothing to wake the orchestrator is refused with the machine line named', async () => {
  const { handlers } = mounted()
  const { dollar } = fakeDollar({})
  const refused = await stop(handlers['classic.Stop'], dollar, stopEvent({}))
  expect((refused.answer as any).block).toContain('Nothing will wake you')
  // The same session declaring its block on the last line passes instead — the message
  // is read where the event carries it.
  const declared = await stop(handlers['classic.Stop'], dollar, stopEvent({ last_assistant_message: 'a report\nwaiting: operator — blocks: the report' }))
  expect(declared.answer).toBe(declared.passed)
})

test('an idle agent delivered of its open pull request is stood down', async () => {
  const { handlers } = mounted()
  const { dollar } = fakeDollar({
    listing: IDLE_ROW,
    chain: '{"tab_id":"T1","tty":"/dev/ttys003","owner":"17"}\n',
    agentCwd: '/tmp/h/work/belt', agentBranch: 'feat/belt\n', prAnswer: '{"number":160,"state":"OPEN"}',
  })
  const { answer } = await stop(handlers['classic.Stop'], dollar, stopEvent({}))
  expect((answer as any).block).toContain('Stand it down now')
  expect((answer as any).block).toContain('pull request #160')
})

test('the transcript is read from the event, not by hunting the projects directory', async () => {
  // The rename lives outside the projects directory: only the event's transcript_path
  // reaches it, the fallback the prompt gate needs would not.
  const renamed = ['{"type":"assistant","message":{"role":"assistant","content":"an answer"}}', '{"type":"custom-title","customTitle":"Orch : round 3"}'].join('\n') + '\n'
  const { handlers } = mounted()
  const named = fakeDollar({ transcript: renamed, noLaunchName: true })
  const refused = await stop(handlers['classic.Stop'], named.dollar, stopEvent({}))
  expect((refused.answer as any).block).toContain('Nothing will wake you')
  const unnamed = fakeDollar({ noLaunchName: true })
  const quiet = await stop(handlers['classic.Stop'], unnamed.dollar, stopEvent({ transcript_path: '' }))
  expect(quiet.answer).toBe(quiet.passed)
  expect(unnamed.written.length).toBe(1)
})

test('the open rows are the session register\'s, read under the event\'s session id', async () => {
  const { handlers } = mounted()
  const open = fakeDollar({ records: ['{"id":"r-12","label":"the report row","state":"open"}\n'] })
  const held = await stop(handlers['classic.Stop'], open.dollar, stopEvent({ last_assistant_message: 'waiting: done' }))
  expect((held.answer as any).block).toContain('row r-12 (the report row) is open')
  const none = fakeDollar({})
  const passed = await stop(handlers['classic.Stop'], none.dollar, stopEvent({ last_assistant_message: 'waiting: done' }))
  expect(passed.answer).toBe(passed.passed)
})

test('a checkout left of the project holds a done stop, read from the event\'s cwd', async () => {
  const { handlers } = mounted()
  const left = fakeDollar({
    top: '/tmp/h/work/repo',
    workspace: '/tmp/h/work/repo/belt | feat/belt | abc1234 | clean | pushed\n',
  })
  const held = await stop(handlers['classic.Stop'], left.dollar, stopEvent({ last_assistant_message: 'waiting: done' }))
  expect((held.answer as any).block).toContain('/tmp/h/work/repo/belt is still there')
  const gone = fakeDollar({ cwd: '', top: '', workspace: '/tmp/h/work/repo/belt | feat/belt | abc1234 | clean | pushed\n' })
  const passed = await stop(handlers['classic.Stop'], gone.dollar, stopEvent({ last_assistant_message: 'waiting: done', cwd: '' }))
  expect(passed.answer).toBe(passed.passed)
})

test('a pending ci-watch log holds the stop once and records the telling', async () => {
  const { handlers } = mounted()
  const message = { last_assistant_message: 'waiting: operator — blocks: the report' }
  const first = fakeDollar({ ciLogs: { 'here-pr160.log': { mtimeMs: 1728000000000, text: 'build\tpending\t9\tu\ntest\tfail\t30\tu\n' } } })
  const held = await stop(handlers['classic.Stop'], first.dollar, stopEvent(message))
  expect((held.answer as any).block).toContain('#160')
  expect((held.answer as any).block).toContain('run_in_background')
  expect(first.wrote[HEADS]).toBe('160 1728000000000 pending test\n')
  // Told once: the next stop passes and leaves the record as it is.
  const second = fakeDollar({
    ciLogs: { 'here-pr160.log': { mtimeMs: 1728000000000, text: 'build\tpending\t9\tu\ntest\tfail\t30\tu\n' } },
    heads: '160 1728000000000 pending test\n',
  })
  const passed = await stop(handlers['classic.Stop'], second.dollar, stopEvent(message))
  expect(passed.answer).toBe(passed.passed)
})

test('a pull request waited on in the background is not told', async () => {
  const { handlers } = mounted()
  const { dollar, wrote } = fakeDollar({
    ciLogs: { 'here-pr160.log': { mtimeMs: 1728000000000, text: 'build\tpending\t9\tu\n' } },
    ps: `/bin/bash ${CI_WATCH} 160\n`,
  })
  const outcome = await stop(handlers['classic.Stop'], dollar, stopEvent({ last_assistant_message: 'waiting: operator — blocks: the report' }))
  expect(outcome.answer).toBe(outcome.passed)
  // Nothing recorded for a watched pull request, so a watch that dies is still told once.
  expect(wrote[HEADS]).toBe('')
})

test('a read that cannot answer in time lets the stop pass and says so', async () => {
  const { handlers } = mounted()
  const { dollar, written } = fakeDollar({ hangListing: true, env: { ORCHESTRATOR_STOP_GATE_DEADLINE: '0.05' } })
  const e = stopEvent({})
  const { answer } = await stop(handlers['classic.Stop'], dollar, e)
  expect(answer).toBe(e)
  expect(written.length).toBe(1)
  expect(written[0]).toContain('| guards |')
  expect(written[0]).toContain('unread')
})

test('a directory that cannot be read lets the stop pass and says so', async () => {
  const { handlers } = mounted()
  const { dollar, written } = fakeDollar({ failCiList: true })
  const e = stopEvent({ last_assistant_message: 'waiting: operator — blocks: the report' })
  const { answer } = await stop(handlers['classic.Stop'], dollar, e)
  expect(answer).toBe(e)
  // The blocks line the gate logs beside the unread one it stands down on.
  expect(written.length).toBe(2)
  expect(written[1]).toContain('| guards |')
  expect(written[1]).toContain('unread')
})
