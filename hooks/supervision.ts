// hooks/supervision.ts
// The shared store: one row per live session — the figures the gauge measured,
// the name the walk read, the repository of the working directory — written by
// this file's own session.measure handler and removed by its session.end, one
// file per key under the module's state root. The coordinator pane below reads
// the rows in this same file, opened for the supervising roles on their
// session.start and drawn on the pane's own render, sorted by rotation
// urgency; a consumer that holds no $ of the writing side (the commands, a
// later task) reads the same files through its own $.fs calls plus the pure
// row parser below.
//
// The engine fences $ to the file that received it — never passed across an
// import — so this file spells its own env resolution, its own log stamp, its
// own origin read and its own transcript-window reader, while the figures
// cross as a plain import (currentReading, no $ argument) and the name runs
// over the walk's pure core with readers built here.
import { currentReading } from './gauge.ts'
import { tripGate } from './gauge-core.ts'
import { roleOf, walkName, BLOCK } from './session-name.ts'
import { withDeadline, isDegradedPass } from './stop-gate.ts'

// One row per live session, the store's whole schema.
export type SessionRow = {
  role: 'orchestrator' | 'agent' | 'auditor' | 'coordinator' | null
  name: string | null
  repo: string | null
  context_percent: number
  context_tokens: number
  window: number
  model: string
  busy: boolean
  updated_at: string
}

// A row no measure has refreshed in an hour belongs to a session that ended
// without its end event — a crash, a kill — and the store does not keep it
// past the figures it would show.
const STALE_AFTER_MS = 60 * 60 * 1000

// The coordinator pane this file draws beside the store it reads: the id names
// it at the engine (the open, the render's requestId, a later close), the
// title its tab while more than one pane is open. The id's spelling is the
// shipped type's own contract — letters, digits, `_` and `-`, at most 64.
const PANE_ID = 'supervision'
const PANE_TITLE = 'Supervised sessions'

// The sort's one law: a row past the rotation gate outranks every row below
// it, however full each side is; within a side, the fill descends. The floor
// is any number no honest fill reaches, added to the fill so the order stays
// one comparison.
const GATE_URGENCY_FLOOR = 1000

// The config dir, this file's own resolution: $ never crosses an import, so
// each domain that needs it spells the same two env reads itself.
async function configDir($: any): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

// The store's root under the module's state dir: one file per key.
function storeDir(config: string): string {
  return `${config}/claude-orchestrator/store`
}

// The key is the session's own: one file per session id, so two sessions
// writing at once write two files and neither merge can lose the other's row.
// The id is sanitised the way the stop gate sanitises its own paths — the key
// names a file, and an id is host-generated but never trusted as a path.
export function sessionKey(id: string): string {
  return `sessions/${id.replace(/[^A-Za-z0-9._-]/g, '_')}`
}

// The row parser, the measure-file doctrine: $.fs.write is not atomic, so a
// line caught mid-write is data that parses to nothing; a row without a stamp
// is no row either — staleness cannot be judged of it, and what the end
// handler truncates must not outlive its session as a phantom.
export function parseSessionRow(text: string): SessionRow | null {
  try {
    const row = JSON.parse(text) as SessionRow
    if (!row || typeof row !== 'object' || typeof row.updated_at !== 'string') return null
    return row
  } catch {
    return null
  }
}

// writeSession reads the key's file, merges the patch over what it finds and
// writes it back stamped: per-key writes do not collide across sessions, and
// the stamp the row is judged stale by is the write's own unless the patch
// carries one (the measure handler passes the reading's own time). The measure
// handler is the only writer of a key: a same-key race is last-writer-wins,
// at most one measure of freshness.
export async function writeSession($: any, id: string, patch: Partial<SessionRow>): Promise<void> {
  const path = `${storeDir(await configDir($))}/${sessionKey(id)}`
  const base: SessionRow = parseSessionRow(String(await $.fs.read(path).catch(() => ''))) ?? {
    role: null, name: null, repo: null,
    context_percent: 0, context_tokens: 0, window: 0,
    model: '', busy: false, updated_at: '',
  }
  const row: SessionRow = { ...base, ...patch, updated_at: patch.updated_at ?? new Date().toISOString() }
  await $.fs.write(path, JSON.stringify(row) + '\n')
}

// One row per live session: every file under the store's sessions directory,
// minus the stale (an hour untouched) and the unreadable (the end handler's
// truncated files among them).
export async function readSessions($: any): Promise<Record<string, SessionRow>> {
  const dir = `${storeDir(await configDir($))}/sessions`
  let entries: { name: string; kind: string }[]
  try {
    entries = await $.fs.list(dir)
  } catch {
    return {}   // no store yet: nothing was ever written
  }
  const rows: Record<string, SessionRow> = {}
  for (const entry of entries) {
    if (!entry || entry.kind !== 'file') continue
    const row = parseSessionRow(String(await $.fs.read(`${dir}/${entry.name}`).catch(() => '')))
    if (!row) continue
    const at = Date.parse(row.updated_at)
    if (!Number.isFinite(at) || Date.now() - at > STALE_AFTER_MS) continue
    rows[`sessions/${entry.name}`] = row
  }
  return rows
}

// $.fs offers no remove (the gauge's own finding, its session.end pins it):
// the key's file is truncated to empty, the row parser reads that as no row,
// and the one-hour staleness collects what a dead session still holds.
export async function deleteSession($: any, id: string): Promise<void> {
  await $.fs.write(`${storeDir(await configDir($))}/${sessionKey(id)}`, '')
}

// The reading's age, the pane row's last element: how long ago the row's own
// measure stamped it. A stamp that parses to nothing names no age (an
// unparseable stamp cannot be judged stale either, and the store has already
// dropped the rows an hour old), so the buckets stop at hours.
function ageLabel(updated_at: string, now: number): string | null {
  const at = Date.parse(updated_at)
  if (!Number.isFinite(at)) return null
  const minutes = Math.floor((now - at) / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

// The pane's rows, the store read end to end and sorted by rotation urgency:
// the sessions past the gate first (they are the rotation's next moves), then
// the rest, each side by fill descending. The label carries what the design
// names — the name, the role, the fill against the gate, the reading's age —
// with the gate the gauge's own double gate, so a session past it by tokens
// alone on a wide window is marked past it here too.
export function paneRows(rows: Record<string, SessionRow>): { label: string; urgency: number }[] {
  const now = Date.now()
  return Object.values(rows)
    .map(row => {
      const past = tripGate(row.context_percent, row.context_tokens, row.window).tripped
      const parts = [
        row.name ?? 'unnamed',
        row.role ?? 'no role',
        `${row.context_percent}%${past ? ' past the gate' : ''}`,
      ]
      const age = ageLabel(row.updated_at, now)
      if (age !== null) parts.push(age)
      return { label: parts.join(' · '), urgency: (past ? GATE_URGENCY_FLOOR : 0) + row.context_percent }
    })
    .sort((a, b) => b.urgency - a.urgency)
}

// The bound on this file's side reads — the name walk, the origin read — the
// guards' own deadline convention inherited at the Task 9 review's word: well
// inside the ten seconds a handler owns, so a read that cannot answer in time
// is quietly no name (no repository), never a late row or a held measure. The
// operator's env knob turns it, milliseconds like its name says.
async function sideReadBoundMs($: any): Promise<number> {
  const raw = await $.env.get('ORCHESTRATOR_SIDE_READ_MS')
  const n = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n : 2000
}

// The session's name under the side-read bound, this file's own walk over its
// own readers (the per-file convention the fence leaves no way around): null
// when the walk loses its race — the row keeps its figures and goes unnamed.
async function nameWithinBound($: any, sessionId: string): Promise<string | null> {
  const walked = await withDeadline(walkName(
    (argv: readonly string[]) => $.process.run(argv),
    async (path: string) => (await $.fs.stat(path)).size,
    (path: string, index: number) => readRange($, path, index),
    await transcriptPathOf($, sessionId),
  ), await sideReadBoundMs($))
  return isDegradedPass(walked) ? null : walked.name
}

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  // The engine allows one no-matcher registration per event, and the gauge
  // owns session.measure's and session.end's: this domain observes the same
  // events beside it, declared by an empty matcher — a partial of e with no
  // field named, so every measure and every end reaches the store. The chain
  // still answers in registration order, which register pins (the gauge
  // first, or the row runs one measure behind).
  on('session.measure', {}, async ($: any, e: any, next: (e: any) => any) => {
    try {
      // The gauge mounted before this domain answers first in the chain, so
      // the reading is this measure's own — fresh, never one measure behind
      // (register pins the order). Without one the gauge itself failed,
      // already said in its own log: no row is written on top of figures
      // nobody has.
      const reading = currentReading()
      if (reading) {
        const sessionId = e.sessionId ?? await $.session.id()
        // The side reads run bounded: a walk or an origin read that cannot
        // answer in time is quietly no name and no repository — the figures
        // still land, and the next measure names the row.
        const name = await nameWithinBound($, sessionId)
        const origin = await withDeadline(repoOf($), await sideReadBoundMs($))
        await writeSession($, sessionId, {
          role: roleOf(name),
          name,
          repo: isDegradedPass(origin) ? null : origin,
          context_percent: reading.context_percent,
          context_tokens: reading.context_tokens,
          window: reading.context_window,
          model: reading.model,
          busy: false,
          updated_at: reading.updated_at,
        })
      }
    } catch (err) {
      // A row that cannot be written never blocks the measure: the next one
      // writes it.
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see:
    // the measure is let through, the state dir says why, and next is
    // replay-safe in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  on('session.end', {}, async ($: any, e: any, next: (e: any) => any) => {
    try {
      await deleteSession($, e.sessionId ?? await $.session.id())
    } catch (err) {
      // The end is never held on the store's own failure; it is said.
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  // The scaffold bare-registered session.start, and the engine allows the
  // second registration of an event only through a matcher: {} names every
  // field of no one, so every start reaches the handler and the role check —
  // the pane belongs to the supervising roles alone — stays inside it.
  on('session.start', {}, async ($: any, e: any, next: (e: any) => any) => {
    try {
      // A session that draws nowhere yet (a -p run, the SDK) has no surface
      // that places a pane, and no later event re-offers the open: the start
      // is answered without spending the walk on it.
      if (e.surface) {
        const name = await nameWithinBound($, await $.session.id())
        const role = roleOf(name)
        if (role === 'coordinator' || role === 'orchestrator') {
          // Unasked — the shipped types' own word for an open no person's
          // command stands behind — the pane waits undrawn under 144 columns
          // and seats itself when the terminal widens or the person opens it;
          // and the open is idempotent, one pane per id, a re-open retitles.
          await $.ui.open({ id: PANE_ID, title: PANE_TITLE })
        }
      }
    } catch (err) {
      // A start is never held on the pane's own failure; it is said.
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  // The pane's own render, the band handler's posture: the matcher names the
  // render envelope's component and requestId — the pane's id, which the open
  // and a later close name too — so the rows are drawn in this plugin's pane
  // alone and never in another plugin's. No surfaces check here: a pane render
  // is raised only where a surface already draws it, placed by the surface.
  on('ui.render', { component: 'Pane', requestId: PANE_ID }, async ($: any, e: any, next: (e: any) => any) => {
    try {
      // The store at draw time is the whole refresh story: the gauge's own
      // invalidate after every measure re-raises this render (an invalidate is
      // any plugin's whose matcher may select it), so the pane follows this
      // session's turn cadence, and the rows the other sessions write land in
      // the files and are read here on the next draw. Display only: nothing is
      // written back, not into the store and not into the event.
      const rows = paneRows(await readSessions($))
      const el = $.ui.resolve(e)
      return el.Box({
        flexDirection: 'column',
        children: rows.map(row =>
          el.Text({ color: row.urgency >= GATE_URGENCY_FLOOR ? 'warning' : 'subtle', children: row.label })
        ),
      })
    } catch (err) {
      // A pane that fails to draw never blocks the render: the engine draws its own.
      await logLine($, (err as Error).message)
      return next(e)
    }
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })
}

// One line in the module's log, the gauge's own shape: the stamp names the
// half that failed. Never throws, never blocks the handler it serves.
async function logLine($: any, message: string): Promise<void> {
  try {
    const config = await configDir($)
    const existing = await $.fs.read(`${config}/claude-orchestrator/hooks-module.log`).catch(() => '')
    await $.fs.write(`${config}/claude-orchestrator/hooks-module.log`, `${existing}${new Date().toISOString()} | supervision | ${message}\n`)
  } catch { /* the log itself never blocks the handler that failed */ }
}

// $.fs.read carries no range and refuses past 4 MiB, so the walk's transcript
// window comes from dd — this file's own reader, the per-file convention: the
// engine fences $ to the file that received it, so guards.ts's identical
// reader cannot be imported, and each domain spells its own over its own $.
async function readRange($: any, path: string, index: number): Promise<string> {
  const { exitCode, stdout } = await $.process.run(['dd', `if=${path}`, `bs=${BLOCK}`, `skip=${index}`, 'count=1'])
  if (exitCode !== 0) throw new Error(`dd exited ${exitCode} on ${path}`)
  return stdout
}

// The transcript, found the gauge's own way (the guards' reader, spelled over
// this file's $): by session id under the projects directory. A miss returns
// '': the rename fallback then names nothing, and the launch name stands alone.
async function transcriptPathOf($: any, sessionId: string): Promise<string> {
  try {
    const projects = `${await configDir($)}/projects`
    for (const entry of await $.fs.list(projects)) {
      if (entry.kind !== 'dir') continue
      const candidate = `${projects}/${entry.name}/${sessionId}.jsonl`
      if (await $.fs.exists(candidate)) return candidate
    }
  } catch { /* no projects directory: no transcript to name */ }
  return ''
}

// The session's repository (`owner/name`), this file's own one-line read of
// the origin remote — the per-file convention again: the stop gate's
// repositoryOf holds its own $ and cannot be imported. The read runs in the
// working directory the host runs the module in, the session's project; null
// when there is no origin: a session outside any checkout reports no
// repository, never a failure.
async function repoOf($: any): Promise<string | null> {
  try {
    const remote = await $.process.run(['git', 'remote', 'get-url', 'origin'])
    if (remote.exitCode !== 0) return null
    return /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(String(remote.stdout ?? '').trim())?.[1] ?? null
  } catch {
    return null
  }
}
