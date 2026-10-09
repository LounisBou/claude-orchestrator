// hooks/guards.ts
// The guards in-process, and the walks they walk. This first half is the
// context gate, hooks/context-gate.sh ported: on every prompt of a session the
// orchestration named, the fill the gauge measured, said to the model past the
// gate — never a line the user must relay. The push guard and the stop gate
// land beside it in their own tasks.
//
// The engine fences $ to the file that received it — never passed across an
// import, a noun of it never read as a value — so the session-name walk and
// the transcript block reader live here, next to the handlers that hold $,
// while their parsing stays pure in session-name.ts.
import { roleOf, isTitle, titleOf, parentAndTty, launchNameOfListing } from './session-name.ts'
import { tripGate, parseMeasure, measureFilePath } from './gauge-core.ts'

// The config dir, gauge.ts's own resolution: $ never crosses an import, so
// each domain that needs it spells the same two env reads itself.
async function configDir($: any): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

export function roleLine(role: string): string {
  // Verbatim from hooks/context-gate.sh:57-63 — the four role answers. The
  // auditor's brief is named from the repository's root, not the shell's
  // absolute install path: the line names the file, the checkout places it.
  switch (role) {
    case 'orchestrator': return 'Succeed at the next quiet boundary — run /orchestrator:succeed: spawn the successor in the operator\'s decision mode, then tell the user; do not ask.'
    case 'agent': return 'Finish the unit in progress, report to your orchestrator with your measured context, and stop; no new phase is dispatched to you.'
    case 'auditor': return 'Report not written, or nothing the operator gave you after it: write the one report with what you have read, and stop. Work he gave you after the report still in hand: succeed — templates/auditor-succession-brief.md; tell him before you hand over.'
    case 'coordinator': return 'With no relay in flight, succeed as skills/coordination/SKILL.md « Your context » says, then tell the operator.'
    default: return ''
  }
}

export function gateAnnouncement(gate: { tripped: boolean; words: string }, role: string): string {
  if (!gate.tripped) return ''
  return `CONTEXT GATE: this session is at ${gate.words}. ${roleLine(role)}`
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
// entry (a rename comes after the original title).
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
          const t = titleOf(lines[i])
          if (t !== null) return t
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
      const announcement = gateAnnouncement(gate, role)
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
