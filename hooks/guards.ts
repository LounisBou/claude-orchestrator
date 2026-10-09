// hooks/guards.ts
// The guards in-process, and the walks they walk. The context gate,
// hooks/context-gate.sh ported: on every prompt of a session the
// orchestration named, the fill the gauge measured, said to the model past the
// gate — never a line the user must relay. The push guard beside it,
// hooks/push-guard.sh ported: every Bash call of a session the launcher
// spawned read for a force, every force but the rebase's lease refused. And
// the stop gate, hooks/stop_gate.py ported: a stop is held until something
// will wake the orchestrator — a busy agent's idle notice, the answer to a
// declared block, the end of a watched pull request's checks.
//
// The engine fences $ to the file that received it — never passed across an
// import, a noun of it never read as a value — so the session-name walk and
// the transcript block reader live here, next to the handlers that hold $,
// while their parsing stays pure in session-name.ts and the stop gate's
// decisions in stop-gate.ts.
import { roleOf, isTitle, titleOf, parentAndTty, launchNameOfListing } from './session-name.ts'
import { tripGate, parseMeasure, measureFilePath } from './gauge-core.ts'
import { detectForces } from './tokenizer.ts'
import {
  refuse, withDeadline, isDegradedPass, type DegradedPass,
  listing, chainEntries, ownAgents, pullRequestOf, openRows, projectCheckouts,
  headsPath, readHeads, writeHeads, parseCiWatchLog, watchNumberOf, watchSlug, watchedNumbers,
  checkWake, checkWakeDone, checkCi,
} from './stop-gate.ts'

// The config dir, gauge.ts's own resolution: $ never crosses an import, so
// each domain that needs it spells the same two env reads itself.
async function configDir($: any): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

export function roleLine(role: string, root = ''): string {
  // Verbatim from hooks/context-gate.sh:57-63 — the four role answers. The
  // auditor's brief is spelled from a root the handler reads: an auditor's cwd
  // is the audited repo, so a path relative to the checkout names a file the
  // model cannot open.
  switch (role) {
    case 'orchestrator': return 'Succeed at the next quiet boundary — run /orchestrator:succeed: spawn the successor in the operator\'s decision mode, then tell the user; do not ask.'
    case 'agent': return 'Finish the unit in progress, report to your orchestrator with your measured context, and stop; no new phase is dispatched to you.'
    case 'auditor': return `Report not written, or nothing the operator gave you after it: write the one report with what you have read, and stop. Work he gave you after the report still in hand: succeed — ${auditorBrief(root)}; tell him before you hand over.`
    case 'coordinator': return 'With no relay in flight, succeed as skills/coordination/SKILL.md « Your context » says, then tell the operator.'
    default: return ''
  }
}

// The auditor's succession brief, openable from any cwd: the shell gate spelled
// the checkout's absolute root for the same reason. The root the host sets for
// the plugin is threaded in from the handler that reads it; without one the
// spelling stays relative — exposed the day Task 12 retires the shell gate that
// absolutizes it today.
function auditorBrief(root: string): string {
  return root ? `${root.replace(/\/+$/, '')}/templates/auditor-succession-brief.md` : 'templates/auditor-succession-brief.md'
}

export function gateAnnouncement(gate: { tripped: boolean; words: string }, role: string, root = ''): string {
  if (!gate.tripped) return ''
  return `CONTEXT GATE: this session is at ${gate.words}. ${roleLine(role, root)}`
}

// The push decision, hooks/push-guard.sh's refusal ported: nothing in a session
// the launcher did not mark (its build command exports the marker), and in a
// marked one every force but the rebase's lease refused. The denial text is
// push-guard.sh:226 verbatim, the tokeniser's reason strings spliced where the
// shell spliced its awk's — they are pinned equal by the tokeniser's fixtures.
export function pushDecision(spawned: string | null | undefined, command: string): { deny: string } | null {
  if (!spawned) return null                        // the operator's own sessions: untouched
  const forces = detectForces(command)
  if (forces.length === 0) return null
  return { deny: `git push refused: this session was spawned by the launcher, and the only forced push allowed here is --force-with-lease=<branch>:<sha> with the sha you read. Seen: ${forces.join(', ')}. If the command only mentions a push, put text that mentions a push in a file (\`git commit -F\`, \`gh … --body-file\`).` }
}

// prompt.submit's `context` is a list of blocks: what the model reads beside the
// prompt, each entry one block after the prompt as typed, and never shown the
// user. The announcement is one block appended after whatever the chain above
// already attached, never a newline folded into another hook's block.
function joinContext(existing: readonly string[] | undefined, line: string): readonly string[] {
  return [...(existing ?? []), line]
}

// The env half of the double gate (context-gate.sh:36-38). An unset or
// unreadable value stays undefined: tripGate applies the default itself.
// $.env.get takes its name as a literal — the engine lists the variables a
// module reads — so each threshold is spelled by its own name.
async function gateEnv($: { env: { get(name: string): Promise<string | undefined> } }) {
  const threshold = (raw: string | undefined) => {
    const n = raw === undefined ? NaN : Number(raw)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  return {
    gate: threshold(await $.env.get('ORCHESTRATOR_CONTEXT_GATE')),
    gateTokens: threshold(await $.env.get('ORCHESTRATOR_CONTEXT_GATE_TOKENS')),
    largeWindow: threshold(await $.env.get('ORCHESTRATOR_LARGE_WINDOW')),
  }
}

// The unmeasured line (context-gate.sh:126-130, said for the one channel the
// module world has): it names what was read, and the gate that cannot be.
function unmeasuredAnnouncement(env: { gate?: number; gateTokens?: number; largeWindow?: number }): string {
  const words = (n: number) => n.toLocaleString('en-US')
  const gate = env.gate ?? 80
  const gateTokens = env.gateTokens ?? 300000
  const largeWindow = env.largeWindow ?? 1000000
  return `CONTEXT GATE: unmeasured: the measure file carries no figure; the next turn fills it. The gate (${gate}%, or ${words(gateTokens)} tokens on a window of ${words(largeWindow)} or more) cannot be read; measure by hand before dispatching or rotating.`
}

// $.fs.read carries no range — the API's own types offer only { as }, and a
// whole read is refused past 4 MiB while transcripts grow past any cap — so a
// block comes from dd through $.process.run: one bounded window per step,
// never the whole file, and every line before the one that matched stays
// unread. dd counts its windows from the file's start, so the blocks are
// aligned there; that changes only which bytes share a read, never what is
// scanned, and the short window is the one holding the file's end.
const BLOCK = 65536

async function readRange($: any, path: string, index: number): Promise<string> {
  const { exitCode, stdout } = await $.process.run(['dd', `if=${path}`, `bs=${BLOCK}`, `skip=${index}`, 'count=1'])
  if (exitCode !== 0) throw new Error(`dd exited ${exitCode} on ${path}`)
  return stdout
}

// A port of title_in() in hooks/session_name.py:51-72 — seek from the end in
// BLOCK-sized steps, carry the cut first line, answer the LAST custom-title
// entry (a rename comes after the original title) unconditionally: an entry
// that names nothing leaves the session unnamed, it does not resurrect the
// name before it.
export async function lastCustomTitle($: any, path: string): Promise<string | null> {
  if (!path) return null
  try {
    const size = (await $.fs.stat(path)).size
    let carry = ''
    for (let index = Math.max(0, Math.ceil(size / BLOCK) - 1); index >= 0; index--) {
      const chunk = (await readRange($, path, index)) + carry
      const lines = chunk.split('\n')
      // Unless this block starts the file, its first line is cut: its
      // beginning lives one block to the left, so it is carried there.
      carry = index > 0 ? (lines.shift() ?? '') : ''
      for (let i = lines.length - 1; i >= 0; i--) {
        if (isTitle(lines[i])) {
          // title_in answers its first match from the end unconditionally:
          // a rename to whitespace — or a value the host did not store as a
          // string — reads back null here and the walk stops, unnamed.
          return titleOf(lines[i])
        }
      }
    }
    return null
  } catch {
    // A transcript that cannot be read, or a block that will not come back,
    // names nothing — the caller falls back to its own quiet path.
    return null
  }
}

// self_tty() ported (iterm_agent.py): the session's own tty, found by walking
// up the process table. The sandbox exposes no process global, so the walk is
// seeded by a shell child of this very session: its controlling tty is the
// session's tab, and its parent is the session's own process.
async function selfTty($: any): Promise<string | null> {
  let ask: readonly string[] = ['sh', '-c', 'ps -o ppid=,tty= -p $$']
  for (let i = 0; i < 12; i++) {
    let out = ''
    try {
      out = (await $.process.run(ask)).stdout
    } catch {
      return null
    }
    if (!out) return null
    const { ppid, tty } = parentAndTty(out)
    if (tty && tty !== '??' && tty !== '-') return `/dev/${tty}`
    if (!/^\d+$/.test(ppid) || Number(ppid) <= 1) return null
    ask = ['ps', '-p', ppid, '-o', 'ppid=,tty=']
  }
  return null
}

// session_name_on() ported (iterm_agent.py): the name the session on a tty was
// launched with, from the same listing the launcher prints (the parse itself,
// flat line and all, is session-name.ts's).
async function launchNameOn($: any, tty: string): Promise<string | null> {
  let out: string
  try {
    out = (await $.process.run(['ps', '-t', tty.replace(/^\/dev\//, ''), '-o', 'pid=,command='])).stdout
  } catch {
    return null
  }
  return launchNameOfListing(out)
}

// read_name() ported (session_name.py:81-92): the tty first — a session with
// none (a headless run) is named by nobody — then the launch name, else the
// transcript's last rename. Exported: the stop gate (Task 8) reads the same
// name in this same file.
export async function readName($: any, transcriptPath: string): Promise<{ tty: string | null; name: string | null }> {
  const tty = await selfTty($)
  if (!tty) return { tty: null, name: null }
  return { tty, name: (await launchNameOn($, tty)) ?? await lastCustomTitle($, transcriptPath) }
}

// prompt.submit's input carries no transcript path — that field belongs to the
// settings hook's payload — so the transcript is found the gauge's own way
// (context-gate.sh's reader): by session id under the projects directory,
// $.session.id() being the transcript file's name. A miss returns '': the
// rename fallback then names nothing, and a transcript nobody wrote holds no
// assistant entry either.
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

// The first-prompt rule (context-gate.sh:113-119): « unmeasured » is said only
// once a turn has answered — a session with no assistant entry yet is not a
// gauge that failed, it is one the gauge has not rendered for at all. The walk
// is the session-name block reader's: from the end, one dd window at a time,
// the cut first line carried, and it stops at the first assistant entry —
// they are dense, so the walk is short and never a whole-file read.
async function transcriptHasAnswer($: any, path: string): Promise<boolean> {
  const isAnswer = (line: string) => /"type"\s*:\s*"assistant"/.test(line)
  if (!path) return false
  try {
    const size = (await $.fs.stat(path)).size
    let carry = ''
    for (let index = Math.max(0, Math.ceil(size / BLOCK) - 1); index >= 0; index--) {
      const lines = ((await readRange($, path, index)) + carry).split('\n')
      // Unless this block starts the file, its first line is cut and carries.
      carry = index > 0 ? (lines.shift() ?? '') : ''
      for (let i = lines.length - 1; i >= 0; i--) {
        if (isAnswer(lines[i])) return true
      }
    }
    return false
  } catch {
    // A transcript that cannot be read has answered nothing the gate can know.
    return false
  }
}

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  // Module memory, the gauge's own law: a reload resets both, so neither the
  // unmeasured line nor the transcript's place survives a re-registration.
  let saidUnmeasured = false
  let transcript: string | null = null
  on('prompt.submit', async ($: any, e: any, next: (e: any) => any) => {
    try {
      const sessionId = await $.session.id()
      if (transcript === null) {
        // A miss is looked up again: a young session's transcript appears with
        // its first turn, and a memo of the miss would pin it forever.
        const found = await transcriptPathOf($, sessionId)
        if (found) transcript = found
      }
      const { name } = await readName($, transcript ?? '')
      const role = roleOf(name)
      if (!role) return next(e)                       // a session never spoken to
      // Only the auditor's line names a file, so only that role pays the read:
      // the root the host sets for the plugin makes the brief openable from the
      // audited repo's cwd. If the host hands none, the spelling falls back to
      // relative — exposed the day Task 12 retires the shell gate below.
      const root = role === 'auditor' ? ((await $.env.get('CLAUDE_PLUGIN_ROOT')) ?? '') : ''
      let raw: string | null = null
      try { raw = await $.fs.read(measureFilePath(await configDir($), sessionId)) } catch { /* no file yet: unmeasured */ }
      const reading = parseMeasure(String(raw ?? ''))
      if (!reading) {
        if (!saidUnmeasured && await transcriptHasAnswer($, transcript ?? '')) {
          saidUnmeasured = true
          return next({ ...e, context: joinContext(e.context, unmeasuredAnnouncement(await gateEnv($))) })
        }
        return next(e)
      }
      const gate = tripGate(reading.context_percent, reading.context_tokens, reading.context_window, await gateEnv($))
      const announcement = gateAnnouncement(gate, role, root)
      if (announcement) return next({ ...e, context: joinContext(e.context, announcement) })
    } catch (err) {
      // A gate that cannot measure lets the prompt through and says so once in
      // the log; the log's own failure stays quiet (the every-handler-logs rule).
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see:
    // the body's own catch handles what throws inside it, this one what it
    // cannot — a handler overrunning its own time bound above all (Review
    // Focus 2's law, here for the walks). Either way the prompt is let
    // through, and the state dir says why; next is replay-safe in a catch,
    // called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  // The push guard (push-guard.sh ported). tool.call's input carries the tool's
  // arguments beside the tool's name — `e.command`, never a nested `input` —
  // and the deny the engine documents for the event is `{ deny: reason }`, the
  // decision's own shape already; the matcher keeps it to Bash calls.
  on('tool.call', { tool: 'Bash' }, async ($: any, e: any, next: (e: any) => any) => {
    try {
      const spawned = await $.env.get('ORCHESTRATOR_SPAWNED')
      const decision = pushDecision(spawned, String(e.command ?? ''))
      if (decision) return decision
      return next(e)
    } catch (err) {
      // A guard that cannot read its input lets the call through and says so —
      // one line in the log, the shell guard's own failure posture.
      await logLine($, (err as Error).message)
      return next(e)
    }
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see,
    // the prompt's own law one handler up: the call is let through, the state
    // dir says why, and next is replay-safe in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  // The stop gate (hooks/stop_gate.py ported; the decisions in stop-gate.ts). The
  // classic events carry the settings payload's own fields — the shipped types give
  // classic.Stop the transcript path, the cwd and the last assistant message beside the
  // module's — so the scope and the message are read off the event itself. The refusal
  // answers through the module's own field, `block` carrying the reason: the classic
  // decision's shape as the engine documents it. Until Task 12 retires the settings
  // hook, the shell gate answers the same stops — both firing is expected, never
  // deduplicated.
  on('classic.Stop', async ($: any, e: any, next: (e: any) => any) => {
    // The sweep's one shot, armed once the stop is known Orch-scoped: every passing
    // exit below calls it before next(e), a refusal never does, and the catch does too
    // (the shell gate's own finally — a stop the gate could not read through passes all
    // the same, and sweeps). Null until the scope is settled, so a failure before it
    // sweeps nothing.
    let sweepAtStop: (() => Promise<void>) | null = null
    try {
      // At most one refusal per turn (stop_gate.py:653-654): the host re-fires the stop
      // with the marker set, and the gate steps aside before it reads anything.
      if (e.stop_hook_active) return next(e)
      const sessionId = String(e.session_id ?? '')
      // The scope first, from the session itself: the launcher's listing is a call to
      // the terminal, and every agent's, auditor's and hand-started session would pay it.
      const transcript = String(e.transcript_path ?? '') || await transcriptPathOf($, sessionId)
      const { tty, name } = await readName($, transcript)
      if (!tty) {
        await logLine($, "stop gate: the session's own tty cannot be read")
        return next(e)
      }
      if (!name) {
        await logLine($, `stop gate: the session's name cannot be read on ${tty}`)
        return next(e)
      }
      if (!name.startsWith('Orch :')) return next(e)
      const state = `${await configDir($)}/claude-orchestrator`
      const root = (await $.env.get('CLAUDE_PLUGIN_ROOT')) ?? ''
      const until = Date.now() + await stopDeadline($)
      let swept = false
      sweepAtStop = async () => {
        if (swept) return
        swept = true
        await runSweep($, state, root, until)
      }
      // Check 1, what will wake you. The agents of this orchestrator are the chain
      // entries its own session wrote, still running one by the listing's glyph.
      const rows = listing(await mustRun($, ['bash', `${root}/skills/iterm-agents/scripts/iterm-agent.sh`, 'list'], "the launcher's listing", until))
      const chain = await quietly($, () => $.fs.read(`${state}/chains/${tty.split('/').pop()}.jsonl`), until, '')
      const session = (await $.env.get('ITERM_SESSION_ID')) ?? ''
      const owner = session.includes(':') ? session.slice(session.lastIndexOf(':') + 1) : ''
      if (!owner) {
        // Said once per stop, as the shell gate said it (stop_gate.py:232): without the
        // owner no chain entry is counted, and the operator should know why the gate
        // saw no agent of its own — a recycled tty's occupant would have been counted.
        await logLine($, 'stop gate: ITERM_SESSION_ID is not set: no chain entry is counted')
      }
      const { agents, resident } = ownAgents(rows, chainEntries(String(chain)), owner)
      const delivered: string[] = []
      for (const agent of agents) {
        if (agent.state !== 'idle') continue
        const pr = await pullRequestRead($, agent.tty, until)
        if (pr && (pr.state === 'OPEN' || pr.state === 'MERGED')) {
          delivered.push(`${agent.label} (pull request #${pr.number}, ${pr.state})`)
        }
      }
      const wake = checkWake({ agents, resident, delivered, message: String(e.last_assistant_message ?? '') })
      if (wake !== null && typeof wake === 'object' && 'blocks' in wake) {
        // The release the machine line grants, logged as the shell gate logged it — the
        // figures that say whether the gate earns its cost are read there.
        await logLine($, `stop gate: check1 blocks ${wake.blocks}`)
      } else if (wake === 'read-what-is-left') {
        // The done line: the facts are read only now, as the shell gate read them lazily.
        const top = await projectTop($, String(e.cwd ?? ''), until)
        const checkouts = projectCheckouts(top, await mustRun($, ['bash', `${root}/skills/orchestrator/scripts/workspace.sh`, 'list'], 'workspace.sh list', until))
        const deferred = openRows(await readRecords($, state, sessionId, until))
        const held = checkWakeDone({ agents, checkouts, deferred })
        if (held) {
          await logLine($, `stop gate: check1 ${held.case}`)
          return refuse(held.reason)
        }
      } else if (wake !== null) {
        await logLine($, `stop gate: check1 ${wake.case}`)
        return refuse(wake.reason)
      }
      // Check 2, the real CI state, over what ci-watch already watched: its logs are the
      // precomputed state, no synchronous network at a stop.
      if (!sessionId) {
        await logLine($, 'stop gate: no session id: the reported heads cannot be kept')
        await sweepAtStop?.()
        return next(e)
      }
      const watches = await listCiWatches($, `${state}/ci-watch`, until)
      if (watches === null) {
        await sweepAtStop?.()
        return next(e)
      }
      // The universe of check 2 is the session's repository alone (stop_gate.py:546-548
      // told only the operator's own OPEN pull requests of the repository the stop's cwd
      // works in): a log is kept when its slug — the repository ci-watch named it for,
      // `owner/name` sanitized the way its log_file() sanitizes, or `here` for a watch
      // armed in the checkout itself without --repo — is this repository's or `here`.
      // Another repository's dead watch never refuses this stop; a repository that
      // cannot be read keeps `here` alone, the name ci-watch itself falls back to. One
      // widening stays, declared: a dead watch of THIS repository's closed or merged
      // pull request is still told once per tell — the shell gate read `--state open`
      // live at the stop and a log name carries no state — and a `here` log is
      // ambiguous by ci-watch's own naming, whichever checkout armed it.
      let resolvedRepo: { name: string | null; why: string } | null = null
      const repository = async () => (resolvedRepo ??= await repositoryOf($, String(e.cwd ?? ''), until))
      const slugOf = (name: string) => name.replace(/[^A-Za-z0-9._-]/g, '_')
      const logs = []
      for (const entry of watches) {
        const number = watchNumberOf(entry.name)
        if (!number || entry.kind !== 'file') continue
        const watched = watchSlug(entry.name)
        if (watched !== 'here') {
          const repo = await repository()
          if (watched !== (repo.name ? slugOf(repo.name) : null)) continue
        }
        const buckets = parseCiWatchLog(await mustReadText($, `${state}/ci-watch/${entry.name}`, `the ci-watch log ${entry.name}`, until))
        logs.push({ number, tell: String(entry.mtimeMs), checks: Object.entries(buckets).map(([name, bucket]) => ({ name, bucket })) })
      }
      let watched: ReadonlySet<string> = new Set()
      if (logs.length > 0) {
        const ps = await inTime($, () => $.process.run(['ps', '-axo', 'command']), until)
        watched = ps && ps.exitCode === 0 ? watchedNumbers(String(ps.stdout ?? '')) : watched
      }
      const headsFile = headsPath(state, sessionId)
      const reported = readHeads(String(await quietly($, () => $.fs.read(headsFile), until, '')))
      const { lines, heads } = checkCi({
        logs,
        reported,
        watched,
        ignored: await ignoredChecks($, state, repository, until),
        watchCommand: `${root}/skills/orchestrator/scripts/ci-watch.sh`,
      })
      // The record is written before the refusal is answered, the shell gate's own
      // order: a head told is a head recorded even if the host never reads the reason.
      if (await inTime($, () => $.fs.write(headsFile, writeHeads(heads)), until) === null) {
        await logLine($, 'stop gate: the reported heads unread: the write did not answer in time')
        throw new GateUnread('the reported heads')
      }
      if (lines.length > 0) {
        await logLine($, `stop gate: check2 ci-not-finished ${lines.map(l => l.split('. Report')[0]).join(' ; ')}`)
        return refuse(lines.join('\n'))
      }
      // The checks have let the stop pass: the sweep runs now, last and never part of
      // the decision (the design's « The sweep runs by itself »).
      await sweepAtStop?.()
      return next(e)
    } catch (err) {
      // A gate that cannot read lets the stop pass and says so — one line, already
      // written where the read failed; anything else the gate broke on is said here.
      // Never a stop held on the gate's own failure.
      if (!(err instanceof GateUnread)) {
        await logLine($, `stop gate: ${String((err as Error)?.message ?? err)}`)
      }
      // The shell gate swept in a finally over its checks: a stop it could not read
      // through passes all the same, and sweeps. Never after a refusal — a refusal
      // returns above, before this.
      await sweepAtStop?.()
      return next(e)
    }
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see, both laws
    // above it: the stop is let through, the state dir says why, and next is
    // replay-safe in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })
}

// One line in the module's log, the gauge's own shape: the stamp names the half
// that failed. Never throws, never blocks the handler it serves.
async function logLine($: any, message: string): Promise<void> {
  try {
    const config = await configDir($)
    const existing = await $.fs.read(`${config}/claude-orchestrator/hooks-module.log`).catch(() => '')
    await $.fs.write(`${config}/claude-orchestrator/hooks-module.log`, `${existing}${new Date().toISOString()} | guards | ${message}\n`)
  } catch { /* the log itself never blocks the handler that failed */ }
}

// --- the sweep (stop_gate.py:595-642) -----------------------------------------------------

// What the sweep leaves of the deadline for the stop's own answer (the python's
// SWEEP_MARGIN).
const SWEEP_MARGIN = 3.0

const firstLine = (text: string): string => text.trim().split('\n')[0] ?? ''

// sweep_due()/sweep() ported: `workspace.sh sweep` within what is left of the deadline,
// at most once per interval, everything it does a log line — never a refusal, never a
// held stop. The stamp is the shell gate's own `sweep.stamp`, shared on purpose unlike
// the heads record's `.mheads` split: its token is a time, the same fact for both
// gates, and one file holds them to one sweep per interval between them until the
// shell half retires. It is written BEFORE the run, so a sweep that hangs is not
// retried by every stop that follows it.
async function runSweep($: any, stateDir: string, root: string, until: number): Promise<void> {
  try {
    // What is left of the whole gate's deadline, minus the margin its own exit needs.
    // Under a second, or not due: nothing runs, nothing is said.
    const left = (until - Date.now()) / 1000 - SWEEP_MARGIN
    if (left < 1) return
    let mtimeMs: number | null = null
    try { mtimeMs = (await $.fs.stat(`${stateDir}/sweep.stamp`)).mtimeMs } catch { mtimeMs = null }
    const every = (Number(await $.env.get('ORCHESTRATOR_SWEEP_INTERVAL')) || 600) * 1000
    if (mtimeMs !== null && Date.now() - mtimeMs < every) return
    await $.fs.write(`${stateDir}/sweep.stamp`, `${Math.floor(Date.now() / 1000)}\n`)
    // The script's own `--deadline` self-limits between items, the real bound; the
    // timeoutMs is the engine's kill of what ignores it (the python killed the process
    // group itself), and the race keeps the stop's answer inside the deadline whatever
    // happens. A run that cannot start is said as its own failure (the python's except
    // naming it, stop_gate.py:642); a run that overruns the bound is one line — it did
    // not finish.
    const ms = Math.round((left + 1.5) * 1000)
    let outcome: { exitCode: number; stdout?: string; stderr?: string } | DegradedPass
    try {
      outcome = await withDeadline(
        $.process.run(
          ['bash', `${root}/skills/orchestrator/scripts/workspace.sh`, 'sweep', '--deadline', String(Math.floor(left))],
          { timeoutMs: ms },
        ),
        ms,
      )
    } catch (err) {
      await logLine($, `stop gate: sweep error ${String((err as Error)?.message ?? err)}`)
      return
    }
    if (isDegradedPass(outcome)) {
      await logLine($, `stop gate: sweep error did not finish within ${Math.floor(left + 1.5)}s`)
      return
    }
    for (const line of String(outcome.stdout ?? '').split('\n')) {
      if (line.startsWith('deleted ')) await logLine($, `stop gate: sweep deleted ${line.slice('deleted '.length)}`)
    }
    if (outcome.exitCode !== 0) {
      await logLine($, `stop gate: sweep error exit ${outcome.exitCode}: ${firstLine(String(outcome.stderr ?? ''))}`)
    }
  } catch { /* the sweep never refuses or delays a stop; its failures are said above */ }
}

// --- the stop gate's reads (hooks/stop_gate.py ported; the decisions in stop-gate.ts) -----

// The gate's own failure posture (stop_gate.py:692-693): a read that cannot be made is
// one log line and a stop that passes. Time is the same failure — every read races what
// is left of one overall deadline, and a read that loses lets the stop pass.
class GateUnread extends Error {}

// The whole gate's deadline (stop_gate.py:109): seconds, the env override the operator
// keeps, the shell gate's own default beside it.
async function stopDeadline($: any): Promise<number> {
  const raw = await $.env.get('ORCHESTRATOR_STOP_GATE_DEADLINE')
  const n = raw === undefined ? NaN : Number(raw)
  return Number.isFinite(n) && n > 0 ? n * 1000 : 20000
}

// The race without the meaning: null when the work lost the race, threw, or the
// deadline was already spent. Each caller decides what that costs — loud (one line, the
// stop passes) or quiet (a fallback), as stop_gate.py's reads were.
async function inTime<T>($: any, work: () => Promise<T>, until: number): Promise<T | null> {
  const left = until - Date.now()
  if (left <= 0) return null
  try {
    const outcome = await withDeadline(work(), left)
    return isDegradedPass(outcome) ? null : outcome
  } catch {
    return null
  }
}

// A quiet read's fallback shape.
async function quietly<T>($: any, work: () => Promise<T>, until: number, fallback: T): Promise<T> {
  const done = await inTime($, work, until)
  return done === null ? fallback : done
}

// A read the gate stands down on: it could not be made, so the stop passes and the log
// says so — never a stop held on the gate's own wait.
async function mustRun($: any, argv: readonly string[], what: string, until: number): Promise<string> {
  const done = await inTime($, () => $.process.run(argv), until)
  if (!done || done.exitCode !== 0) {
    await logLine($, `stop gate: ${what} unread: ${!done ? 'it did not answer in time' : `it exited ${done.exitCode}`}`)
    throw new GateUnread(what)
  }
  return String(done.stdout ?? '')
}

async function mustReadText($: any, path: string, what: string, until: number): Promise<string> {
  let text: unknown = null
  try {
    const left = until - Date.now()
    text = left > 0 ? await withDeadline($.fs.read(path), left) : null
  } catch (err) {
    await logLine($, `stop gate: ${what} unread: ${String((err as Error)?.message ?? err)}`)
    throw new GateUnread(what)
  }
  if (text === null || isDegradedPass(text)) {
    await logLine($, `stop gate: ${what} unread: it did not answer in time`)
    throw new GateUnread(what)
  }
  return String(text)
}

// pull_request_of()'s reads (stop_gate.py:250-275; the launcher's host_cli_cwd): the
// working directory of the host process on the agent's tty, that checkout's branch,
// then one gh read — the only network the gate pays, for an idle agent alone. Any read
// that fails, or cannot answer in time, is no pull request: the refusal simply does not
// name the agent, never a stop held on it.
async function pullRequestRead($: any, tty: string, until: number): Promise<{ number: string; state: string } | null> {
  // The host's own name, the launcher's default beside it (ORCHESTRATOR_HOST_CLI).
  const host = (await $.env.get('ORCHESTRATOR_HOST_CLI')) ?? 'claude'
  const pattern = new RegExp(`^(\\S*/)?${host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`)
  const ps = await inTime($, () => $.process.run(['ps', '-t', tty.replace(/^\/dev\//, ''), '-o', 'pid=,command=']), until)
  if (!ps || ps.exitCode !== 0) return null
  let pid = ''
  for (const line of String(ps.stdout ?? '').split('\n')) {
    const row = /^\s*(\d+)\s+(.*\S)/.exec(line)
    if (pattern.test(row ? row[2] : line.trim())) {
      pid = row ? row[1] : ''
      break
    }
  }
  if (!/^\d+$/.test(pid)) return null
  const lsof = await inTime($, () => $.process.run(['lsof', '-a', '-p', pid, '-d', 'cwd', '-Fn']), until)
  if (!lsof || lsof.exitCode !== 0) return null
  const cwd = String(lsof.stdout ?? '').split('\n').find(l => l.startsWith('n'))?.slice(1) ?? ''
  if (!cwd) return null
  const git = await inTime($, () => $.process.run(['git', '-C', cwd, 'symbolic-ref', '--short', '-q', 'HEAD']), until)
  const branch = git && git.exitCode === 0 ? String(git.stdout ?? '').trim() : ''
  if (!branch) return null
  const gh = await inTime($, () => $.process.run(['gh', 'pr', 'view', branch, '--json', 'number', 'state']), until)
  if (!gh || gh.exitCode !== 0) return null
  return pullRequestOf(branch, String(gh.stdout ?? ''))
}

// The project's root (project_checkouts' first half): git's answer, or the cwd itself
// when git gives none. The shell gate resolved the path; the sandbox exposes no
// resolver, and the cwd names the same project to workspace.sh's own listing.
async function projectTop($: any, cwd: string, until: number): Promise<string> {
  const done = await inTime($, () => $.process.run(['git', '-C', cwd, 'rev-parse', '--show-toplevel']), until)
  const top = done && done.exitCode === 0 ? String(done.stdout ?? '').trim() : ''
  return top || cwd
}

// open_rows()'s reads (stop_gate.py:315-337): the register this session's records were
// filed under, one path a line, then each record file. A read that fails is no row.
async function readRecords($: any, state: string, sessionId: string, until: number): Promise<string[]> {
  const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, '_')
  const register = await quietly($, () => $.fs.read(`${state}/records/${safe}`), until, '')
  const texts: string[] = []
  for (const line of String(register).split('\n')) {
    const path = line.trim()
    if (path) texts.push(String(await quietly($, () => $.fs.read(path), until, '')))
  }
  return texts
}

// The session's repository (`owner/name`), read from the origin remote of the cwd —
// the same fact the shell gate read from gh, a local read now. Null when it cannot be
// known; `why` is the half-line ignored-checks says when it had entries to match.
async function repositoryOf($: any, cwd: string, until: number): Promise<{ name: string | null; why: string }> {
  const remote = await inTime($, () => $.process.run(['git', '-C', cwd, 'remote', 'get-url', 'origin']), until)
  if (!remote) return { name: null, why: 'the origin remote did not answer in time' }
  if (remote.exitCode !== 0) return { name: null, why: 'git remote get-url origin did not answer' }
  const url = String(remote.stdout ?? '').trim()
  const name = /[:/]([^/:]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1]
  if (!name) return { name: null, why: url ? `the origin URL names no repository: ${url}` : 'the origin URL is empty' }
  return { name, why: '' }
}

// ignored_checks() ported (stop_gate.py:481-508): the names of the checks the machine
// ignores for the session's repository, one `<owner>/<repo> <check name>` per line. An
// absent file is empty; a malformed line is said and dropped (stop_gate.py:498); a file
// that cannot be read, or a repository that cannot be known, is said once (its
// unreadable line at :507) and filters nothing: a red is never lost for want of a read.
async function ignoredChecks(
  $: any,
  state: string,
  repository: () => Promise<{ name: string | null; why: string }>,
  until: number,
): Promise<Set<string>> {
  let raw: unknown = null
  try {
    const left = until - Date.now()
    raw = left > 0 ? await withDeadline($.fs.read(`${state}/ignored-checks`), left) : null
  } catch (err) {
    const message = String((err as Error)?.message ?? err)
    if (!/ENOENT|no such/i.test(message)) {
      await logLine($, `stop gate: ignored-checks unreadable: ${message}`)
    }
    return new Set()
  }
  if (raw === null || isDegradedPass(raw)) return new Set()
  const entries: [string, string][] = []
  for (const line of String(raw).split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const [repo, ...rest] = line.trim().split(/\s+/)
    const name = rest.join(' ').trim()
    if (repo.includes('/') && name) entries.push([repo, name])
    else await logLine($, `stop gate: ignored-checks malformed line: ${line}`)
  }
  if (entries.length === 0) return new Set()
  const repo = await repository()
  if (repo.name === null) {
    await logLine($, `stop gate: ignored-checks repository unread: ${repo.why}`)
    return new Set()
  }
  const wanted = repo.name.toLowerCase()
  return new Set(entries.filter(([ownerRepo]) => ownerRepo.toLowerCase() === wanted).map(([, name]) => name))
}

// The watches ci-watch left behind (check 2's data): an absent directory is no watch
// ever run — the state dir is born without one — and anything else that cannot be read
// stands the check down. Null answers mean exactly that: already said in the log.
async function listCiWatches($: any, dir: string, until: number): Promise<{ name: string; kind: string; mtimeMs: number }[] | null> {
  let listed: unknown = null
  try {
    const left = until - Date.now()
    listed = left > 0 ? await withDeadline($.fs.list(dir), left) : null
  } catch (err) {
    const message = String((err as Error)?.message ?? err)
    if (/ENOENT|no such/i.test(message)) return []
    await logLine($, `stop gate: the ci-watch watches unread: ${message}`)
    return null
  }
  if (listed === null || isDegradedPass(listed)) {
    await logLine($, 'stop gate: the ci-watch watches unread: it did not answer in time')
    return null
  }
  return (listed as { name: string; kind: string; mtimeMs: number }[])
    .filter(entry => entry && typeof entry.name === 'string')
    .map(entry => ({ name: entry.name, kind: String(entry.kind), mtimeMs: Number(entry.mtimeMs) || 0 }))
}
