// hooks/stop-gate.ts
// The stop gate's checks over plain values, hooks/stop_gate.py ported for the
// in-process module: what will wake the orchestrator (check 1) and the real
// state of the pull requests ci-watch watched (check 2). Pure on purpose — the
// engine fences $ to the file that received it, so every read the checks pay
// happens in guards.ts's handler and its answer passes in here. The refusal
// texts are stop_gate.py's verbatim where the data source did not change
// beneath them; where it did, the change is said at the check itself.
//
// The classic events carry the settings payload's own fields beside the
// module's — the shipped types give classic.Stop the transcript path, the cwd
// and the last assistant message — so the handler reads them off the event and
// this file never waits on anything.

// --- the decision shapes -----------------------------------------------------------------

// The classic decision `{"decision":"block","reason":…}` answers through the
// module's own field: `block` carries the reason text (the shipped types'
// ClassicResult documents exactly this mapping, and "a field of the wrong
// shape fails the hook, which is skipped" — a `decision` field would let every
// stop through untold).
export function refuse(reason: string): { block: string } {
  return { block: reason }
}

// The wake decision at the summary level, the composition the done branch of
// check 1 makes when the facts disagree with the message. A busy own agent and
// a declared blocking question both RELEASE the stop — the agent's idle notice
// and the answer are what wake the orchestrator next (stop_gate.py:363-364;
// its wrapper's header names the busy agent first among the releases).
export function wakeDecision(summary: {
  busyOwnAgents: readonly string[]
  blockingQuestion: string | null
  openRows: readonly string[]
  leftBehind?: readonly string[]
}): { decision: 'pass' } | { decision: 'block'; reason: string } {
  if (summary.busyOwnAgents.length > 0) return { decision: 'pass' }
  if (summary.blockingQuestion !== null) return { decision: 'pass' }
  const left = summary.leftBehind ?? []
  const deferred = summary.openRows
  if (left.length === 0 && deferred.length === 0) return { decision: 'pass' }
  return { decision: 'block', reason: notDoneReasons(left, deferred).join(' ') }
}

// One race, the whole gate's own law: stop_gate.py runs under a single deadline
// checked between its external calls, and a read that cannot answer in time
// lets the stop pass. The degraded answer is a value told apart from the work's
// own, so the handler can say so in the log and stand down.
export type DegradedPass = { decision: 'pass'; degraded: true }
const DEGRADED: DegradedPass = { decision: 'pass', degraded: true }

export function isDegradedPass(value: unknown): value is DegradedPass {
  return typeof value === 'object' && value !== null && (value as { degraded?: unknown }).degraded === true
}

export async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | DegradedPass> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<DegradedPass>((resolve) => { timer = setTimeout(() => resolve(DEGRADED), ms) })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}

// --- the refusal texts (stop_gate.py:126-146, verbatim) -----------------------------------

const NOTHING = 'Nothing will wake you: no agent of yours is running. Launch what you announced, '
  + 'or, if a question truly blocks, end with the line '
  + 'waiting: operator — blocks: <what it blocks>, or with waiting: done. '
  + "The line goes as the message's last line, no markup."
const MALFORMED = 'Your last line is not the machine line: end the message with the line '
  + 'waiting: operator — blocks: <what it blocks>, or with waiting: done, '
  + "as the message's last line, no markup."
const idleDelivered = (who: string) =>
  `Idle with its pull request open or merged: ${who}. Stand it down now — or, if it waits on a question you have not answered, answer it.`
const IDLE_ONE = '%s is idle: its notice was spent. Read its report or relaunch it.'
const IDLE_MANY = '%s are idle: their notices were spent. Read their reports or relaunch them.'
const QUESTION = 'Your question blocks nothing declared: advance everything that can advance; its answer will come in a later turn.'
const NOT_DONE_ONE = 'Not done: %s is still there. Finish it, or say what blocks it.'
const NOT_DONE_MANY = 'Not done: %s are still there. Finish them, or say what blocks them.'
const ROW_ONE = 'Not done: row %s is open. Dispatch it, close it, or say what blocks it.'
const ROW_MANY = 'Not done: rows %s are open. Dispatch them, close them, or say what blocks them.'

function notDoneReasons(left: readonly string[], deferred: readonly string[]): string[] {
  const reasons: string[] = []
  if (left.length > 0) reasons.push((left.length === 1 ? NOT_DONE_ONE : NOT_DONE_MANY).replace('%s', left.join(', ')))
  if (deferred.length > 0) reasons.push((deferred.length === 1 ? ROW_ONE : ROW_MANY).replace('%s', deferred.join(', ')))
  return reasons
}

// The machine line once normalised: the dash between « operator » and « blocks: » may
// be any a model reaches for, and the spacing around it is free. A hyphen inside the
// reason is the reason's own and is kept.
const MACHINE_LINE = /^waiting:\s*(?:operator\s*(?:—|–|--|-)\s*blocks:\s*(.+)|(done))$/i
const LOOKS_DECLARED = /\bblocks\b\W*\w/i
const MARKUP = /^[`*_ \t]+/g
const MARKUP_END = /[`*_ \t]+$/g

// normalise() ported (stop_gate.py:291-307): the message's last line as the machine
// line would read, whatever the markup a model wrote it in — backticks, bold or
// italics, a quote or a bullet mark, surrounding spaces, one trailing period.
function normalise(line: string): string {
  line = line.trim()
  for (;;) {
    const before = line
    line = line.replace(MARKUP, '').replace(MARKUP_END, '')
    if (line.startsWith('>')) line = line.slice(1)
    else if (/^[-*]\s/.test(line)) line = line.slice(1)
    else if (line.endsWith('.')) line = line.slice(0, -1)
    if (line === before) return line
  }
}

export function machineLine(message: string): string {
  const lines = message.split('\n').filter(l => l.trim() !== '')
  return lines.length > 0 ? normalise(lines[lines.length - 1]) : ''
}

// --- the launcher's listing (stop_gate.py:187-219) ---------------------------------------

export type Row = { tty: string; title: string; name: string }

// parse_row() ported: `w1/t2 | <tty> | <title> | <name>[ | self][ | hidden]`, the
// launcher's row_for. The title may carry the row's own separator and is rejoined.
function parseRow(line: string): Row | null {
  const parts = line.split(' | ')
  if (parts.length < 4) return null
  while (parts.length > 4 && (parts[parts.length - 1] === 'self' || parts[parts.length - 1] === 'hidden')) parts.pop()
  return { tty: parts[1], title: parts.slice(2, -1).join(' | '), name: parts[parts.length - 1] }
}

export function listing(out: string): Row[] {
  return out.split('\n').map(parseRow).filter((r): r is Row => r !== null)
}

// activity() ported: `idle`, `busy`, or null when the title carries no host activity
// glyph — a shell left behind by an agent that exited, or a stranger's tab on a
// recycled tty.
const IDLE_GLYPH = '✳'
function activity(title: string): 'idle' | 'busy' | null {
  const glyph = title.split(' ', 1)[0] ?? ''
  if (glyph === IDLE_GLYPH) return 'idle'
  if (glyph.length === 1 && glyph.charCodeAt(0) > 127 && !/\p{L}|\p{N}/u.test(glyph)) return 'busy'
  return null
}

// label() ported: the name it was launched with, unless it is the launcher's own
// parenthesised mark — then the title, else the tty.
function labelOf(row: Row): string {
  return row.name && !row.name.startsWith('(') ? row.name : (row.title || row.tty)
}

// --- the orchestrator's own agents (stop_gate.py:224-247) --------------------------------

export type ChainEntry = { tab_id: unknown; tty: string; owner?: unknown; resident?: unknown }
export type OwnAgent = { label: string; state: 'idle' | 'busy'; tty: string }

// own_agents() ported: the chain entries this session wrote that still run an agent,
// an idle resident agent left out, and whether one such resident was seen. With no
// owner known no entry is counted — a recycled tty's occupant would be (the chain file
// outlives the session that wrote it).
export function ownAgents(rows: readonly Row[], entries: readonly ChainEntry[], owner: string):
{ agents: OwnAgent[]; resident: boolean } {
  if (!owner) return { agents: [], resident: false }
  const byTty = new Map(rows.map(r => [r.tty, r]))
  const agents: OwnAgent[] = []
  let resident = false
  for (const entry of entries) {
    if (entry.owner !== owner) continue
    const row = byTty.get(entry.tty)
    const state = row ? activity(row.title) : null
    if (state === 'idle' && entry.resident === true) {
      // Spawned with --resident: idle by design, never one to read or relaunch. Not
      // busy either: it lifts no check but the last fallback.
      resident = true
      continue
    }
    if (state) agents.push({ label: labelOf(row!), state, tty: entry.tty })
  }
  return { agents, resident }
}

// chain_read() ported over an already-read text: entries with a tab id and a tty;
// a line that is no entry is no entry.
export function chainEntries(text: string): ChainEntry[] {
  const entries: ChainEntry[] = []
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    try {
      const entry = JSON.parse(line)
      if (entry && typeof entry === 'object' && entry.tab_id && typeof entry.tty === 'string') entries.push(entry)
    } catch { /* a line that is no entry is no entry */ }
  }
  return entries
}

// --- the pull request of an idle agent (stop_gate.py:250-288) ----------------------------

// pull_request_of() ported over the answers the handler read: the branch's pull
// request, or nothing. The one gh read the shell gate paid per idle agent stays one
// read in the handler; this decides what the answer says.
export function pullRequestOf(branch: string | null, answer: string | null): { number: string; state: string } | null {
  if (!branch || !answer) return null
  try {
    const pr = JSON.parse(answer)
    if (pr === null || typeof pr !== 'object' || pr.number === undefined || pr.state === undefined) return null
    return { number: String(pr.number), state: String(pr.state) }
  } catch {
    return null
  }
}

// --- the rows and checkouts of a done message (stop_gate.py:315-353) ----------------------

// open_rows() ported over the already-read record files: `<id> (<label>)` for each
// row still open, no matter which record file carries it.
export function openRows(texts: readonly string[]): string[] {
  const rows: string[] = []
  for (const text of texts) {
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const row = JSON.parse(line)
        if (row && typeof row === 'object' && row.state === 'open') {
          rows.push(`${row.id} (${row.label || 'no label'})`)
        }
      } catch { /* a line that is no row: no row */ }
    }
  }
  return rows
}

const basename = (p: string) => p.split('/').filter(Boolean).pop() ?? ''
const dirname = (p: string) => p.split('/').slice(0, -1).join('/') || '/'

// project_checkouts() ported (its git and workspace reads happen in the handler):
// the checkouts workspace.sh made of the session's project, <root>/<project>/<name>.
export function projectCheckouts(top: string, listOut: string): string[] {
  const project = basename(top)
  const found: string[] = []
  for (const line of listOut.split('\n')) {
    const path = line.split(' | ', 1)[0].trim()
    if (path && path !== top && basename(dirname(path)) === project) found.push(path)
  }
  return found
}

// --- check 1 (stop_gate.py:356-392) --------------------------------------------------------

export type Held = { case: string; reason: string }

// check_wake()'s first half: everything decidable before the facts of a done message
// are read. `null` — something will wake the orchestrator — releases the stop; a
// `{ blocks }` answer is the release the machine line grants, kept for the log the
// shell gate writes (its cost figures are read there); 'read-what-is-left' hands the
// decision to the done branch, which needs the checkouts and the records.
export function checkWake(facts: {
  agents: readonly OwnAgent[]
  resident: boolean
  delivered: readonly string[]
  message: string
}): Held | { blocks: string } | 'read-what-is-left' | null {
  // Before everything else: neither a busy agent beside it nor a declared block lifts it.
  if (facts.delivered.length > 0) {
    return { case: 'idle-delivered', reason: idleDelivered(facts.delivered.join(', ')) }
  }
  if (facts.agents.some(a => a.state === 'busy')) return null
  const last = machineLine(facts.message)
  const matched = MACHINE_LINE.exec(last)
  if (matched && matched[1]) return { blocks: matched[1] }
  if (matched) return 'read-what-is-left'
  if (facts.agents.length > 0) {
    const names = facts.agents.map(a => a.label).join(', ')
    return { case: 'idle-agents', reason: (facts.agents.length === 1 ? IDLE_ONE : IDLE_MANY).replace('%s', names) }
  }
  if (last.toLowerCase().startsWith('waiting') && LOOKS_DECLARED.test(last)) {
    return { case: 'malformed-machine-line', reason: MALFORMED }
  }
  if (last.toLowerCase().startsWith('waiting:') || last.endsWith('?')) {
    return { case: 'question-without-blocks', reason: QUESTION }
  }
  if (facts.resident) {
    // An idle resident agent waits on a background command of its own, and that
    // command wakes it as a running turn would: something will wake the orchestrator.
    return null
  }
  return { case: 'nothing-will-wake', reason: NOTHING }
}

// check_wake()'s done branch, over the facts the handler read: what is left of the
// project and the rows still open. Nothing left and nothing open: the message's word
// is taken and the stop passes.
export function checkWakeDone(left: {
  agents: readonly OwnAgent[]
  checkouts: readonly string[]
  deferred: readonly string[]
}): Held | null {
  const stillThere = [...left.checkouts, ...left.agents.map(a => a.label)]
  if (stillThere.length === 0 && left.deferred.length === 0) return null
  return { case: 'not-done', reason: notDoneReasons(stillThere, left.deferred).join(' ') }
}

// --- the heads record (stop_gate.py:397-435) ----------------------------------------------

// The module's own file: the shell gate keeps `<safe>.heads` for the heads gh read it,
// and the two records' head tokens are not one another's — this one tells a watch, not
// a sha (ci-watch's logs carry none). Same line format otherwise.
export function headsPath(stateDir: string, sessionId: string): string {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${stateDir}/stop-gate/${safe}.mheads`
}

export type HeadEntry = readonly [tell: string, state: 'pending' | 'done', failing: ReadonlySet<string>]
export type Heads = Map<string, HeadEntry>

// read_heads() ported: per pull request number, (tell, state, failing names). A line is
// `<number> <tell> <pending|done> [<failing names, quoted, comma-joined>]`; a two-field
// line, written by the previous shape, reads as done.
export function readHeads(text: string): Heads {
  const heads: Heads = new Map()
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 2 || parts.length > 4 || parts[0] === '') continue
    const state = parts.length > 2 ? parts[2] : 'done'
    if (state !== 'pending' && state !== 'done') continue
    const failing = parts.length === 4
      ? new Set(parts[3].split(',').map(n => decodeName(n)))
      : new Set<string>()
    heads.set(parts[0], [parts[1], state, failing])
  }
  return heads
}

// write_heads()'s line, over the map the check returns: numbers in numeric order, the
// failing names sorted and quoted so a name carrying the separator cannot split.
export function writeHeads(heads: Heads): string {
  const numbers = [...heads.keys()].sort((a, b) => Number(a) - Number(b))
  return numbers.map(number => {
    const [tell, state, failing] = heads.get(number)!
    let line = `${number} ${tell} ${state}`
    if (failing.size > 0) line += ' ' + [...failing].sort().map(n => encodeName(n)).join(',')
    return line + '\n'
  }).join('')
}

const encodeName = (name: string) => name.replace(/[^A-Za-z0-9_.~-]/g, ch =>
  [...ch].map(c => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')).join(''))
const decodeName = (name: string) => name.replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
  String.fromCharCode(parseInt(hex, 16)))

// --- check 2, over ci-watch's precomputed data (stop_gate.py:450-461, 537-592) -------------

// The shell gate read the pull requests and their checks from gh at the stop — a
// synchronous network call the module world refuses. ci-watch has already watched
// them: it appends `name\tbucket\telapsed\tlink` snapshots to
// `<state>/ci-watch/<slug>-pr<n>.log`, truncated at each watch's start, and that file
// is the state the check reads. Two consequences it lives with, said here: the log
// names no head sha, so the tell a head is told once for is the log's modification
// time — a new watch truncates the log, a new mtime, and the telling starts over —
// and the refusal names the pull request without the sha it sat at.
export type CiWatchLog = { number: string; tell: string; checks: readonly { name: string; bucket: string }[] }

// The last bucket each check carries: a snapshot appends, so the final line of a
// check's history is its state.
export function parseCiWatchLog(text: string): Record<string, string> {
  const checks: Record<string, string> = {}
  for (const raw of text.split('\n')) {
    const parts = raw.replace(/\r$/, '').split('\t')
    if (parts.length < 2 || !parts[0]) continue
    checks[parts[0]] = parts[1]
  }
  return checks
}

// The pull request number a log name carries: `<slug>-pr<n>.log`, the base-branch
// watches of merged pull requests apart (-base, no number of their own to tell).
export function watchNumberOf(name: string): string | null {
  if (/-pr\d+-base\.log$/.test(name)) return null
  const m = /-pr(\d+)\.log$/.exec(name)
  return m ? m[1] : null
}

// watched_numbers() ported: the pull request numbers a ci-watch process is alive for.
// `ci-watch.sh <n>` as a process's command line: the script run by a shell or by its
// own path, then the number. An editor open on the script, or a `grep ci-watch.sh 12`,
// is no watch.
const WATCH_PROCESS = /^\s*(?:\S*\/)?(?:(?:bash|sh|zsh)\s+(?:-\S+\s+)*)?\S*ci-watch\.sh\s+(\d+)(?:\s|$)/

export function watchedNumbers(psOut: string): Set<string> {
  const watched = new Set<string>()
  for (const line of psOut.split('\n')) {
    const m = WATCH_PROCESS.exec(line)
    if (m) watched.add(m[1])
  }
  return watched
}

const ciState = (number: string, pending: readonly string[], failing: readonly string[], watchCommand: string) =>
  `#${number}: ${pending.length} checks pending (${pending.join(', ')}), ${failing.length} failing (${failing.join(', ')}). `
  + `Report this state as it is; to wait for the end, start \`${watchCommand} ${number}\` with `
  + '`run_in_background` (timeout 7200000), never in the foreground.'

const setsEqual = (a: ReadonlySet<string>, b: ReadonlySet<string>) =>
  a.size === b.size && [...a].every(x => b.has(x))

// check_ci() ported over ci-watch's logs (stop_gate.py:537-592): the refusal lines, one
// per pull request whose head has checks pending or failing and has not been told for
// that state. A head is told once while pending, again when a check fails (once per
// failing set), and once more when it finished failing for a set not yet told; a moved
// tell starts over. A head waited on in the background is not told and not recorded, so
// a watch that dies is told once; a head whose checks are all ignored, or none read at
// all, is unread: read again at the next stop, recorded only if it already had a record.
export function checkCi(input: {
  logs: readonly CiWatchLog[]
  reported: Heads
  watched: ReadonlySet<string>
  ignored: ReadonlySet<string>
  watchCommand: string
}): { lines: string[]; heads: Heads } {
  const heads: Heads = new Map()
  const lines: string[] = []
  for (const log of input.logs) {
    const recorded = input.reported.get(log.number)
    const seen = recorded && recorded[0] === log.tell ? recorded : undefined
    if (seen && seen[1] === 'done') {
      heads.set(log.number, seen)
      continue
    }
    const checks = log.checks.filter(c => !input.ignored.has(c.name))
    if (checks.length === 0) {
      // A push seen before its checks were registered, or a head whose only checks are
      // ignored ones: unread, read again at the next stop.
      if (seen) heads.set(log.number, seen)
      continue
    }
    const pending = checks.filter(c => c.bucket === 'pending').map(c => c.name)
    const failing = checks.filter(c => c.bucket === 'fail' || c.bucket === 'cancel').map(c => c.name)
    const told = seen ? seen[2] : new Set<string>()
    if (pending.length > 0 && !seen && failing.length === 0 && input.watched.has(log.number)) {
      // Waited for in the background, and woken by its end: nothing to refuse, and
      // nothing recorded.
      continue
    }
    const failingSet = new Set(failing)
    if ((pending.length > 0 && !seen) || (failing.length > 0 && !setsEqual(failingSet, told))) {
      lines.push(ciState(log.number, pending, failing, input.watchCommand))
    }
    heads.set(log.number, [log.tell, pending.length > 0 ? 'pending' : 'done', pending.length > 0 ? failingSet : new Set<string>()])
  }
  return { lines, heads }
}
