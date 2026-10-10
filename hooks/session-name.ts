// hooks/session-name.ts
// The pure half of the session's naming, ported from hooks/session_name.py: the
// parsers the walk feeds — the role of a name, the value of a custom-title
// entry, the name a flat ps listing was launched with — and the walk itself,
// running over injected plain reader thunks. The engine fences $ to the file
// that received it — never passed across an import, a noun of it never read as
// a value — so the reads stay in the files whose handlers hold $ (guards.ts,
// supervision.ts), each building the same thunks over its own $ while this
// file holds the walk's logic once.
const NAME_READABLE_MAX = 40

// The block the transcript walks read: dd's window, the unit the carry logic
// below counts in. Exported: the $-holding halves size their windows with it.
export const BLOCK = 65536

// The walk's reads, injected as plain function values, never $: `run` covers
// the process table (the self-tty seed, the launch listing), `sizeOf` and
// `readText` the transcript's blocks — one BLOCK-sized window at `index`,
// counted from the file's start, the reader the engine's own range-less fs
// makes dd spell.
export type Run = (argv: readonly string[]) => Promise<{ exitCode: number; stdout?: string; stderr?: string }>
export type SizeOf = (path: string) => Promise<number>
export type ReadText = (path: string, index: number) => Promise<string>

export function roleOf(name: string | null): 'orchestrator' | 'agent' | 'auditor' | 'coordinator' | null {
  if (!name) return null
  if (name.startsWith('Orch :')) return 'orchestrator'
  if (name.startsWith('Agent :')) return 'agent'
  if (name.startsWith('Audit :')) return 'auditor'
  if (name.startsWith('Coord :')) return 'coordinator'
  return null
}

export function isTitle(line: string): boolean {
  return /"type"\s*:\s*"custom-title"/.test(line)
}

// unquoted()'s rule (session_name.py:75-78): whitespace off, then the
// surrounding quotes, then whitespace again; what remains empty reads as null —
// a padded or quoted rename still names its role.
export function titleOf(line: string): string | null {
  const m = line.match(/"customTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (!m) return null
  const title = (JSON.parse(`"${m[1]}"`) as string).trim().replace(/^["']+/, '').replace(/["']+$/, '').trim()
  return title || null
}

// self_tty()'s parse: the parent and the controlling tty of one ps line,
// either of which may be absent or report none.
export function parentAndTty(out: string): { ppid: string; tty: string } {
  const [ppid = '', tty = ''] = out.trim().split(/\s+/)
  return { ppid, tty }
}

// session_name_on()'s parse (iterm_agent.py): the name a session was launched
// with, read from the FLAT command line ps prints — the quoting that made the
// name one argument is gone, and the launcher puts --name last precisely so
// the words after it run to the end of the line. Past the launcher's own bound
// (NAME_READABLE_MAX) what the table hands back is a launch line, not a name.
export function launchNameOfListing(out: string): string | null {
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^\S+\s+(.+)$/)
    if (!m) continue
    const words = m[1].split(/\s+/)
    const at = words.indexOf('--name')
    if (at < 0) continue
    const tail: string[] = []
    for (const word of words.slice(at + 1)) {
      if (word.startsWith('--')) break
      tail.push(word)
    }
    if (tail.length === 0) continue
    const joined = tail.join(' ')
    return joined.length <= NAME_READABLE_MAX ? joined : null
  }
  return null
}

// --- the walk itself (moved home from guards.ts, unchanged in behavior) -------------------

// self_tty() ported (iterm_agent.py): the session's own tty, found by walking
// up the process table. The sandbox exposes no process global, so the walk is
// seeded by a shell child of this very session: its controlling tty is the
// session's tab, and its parent is the session's own process.
async function selfTty(run: Run): Promise<string | null> {
  let ask: readonly string[] = ['sh', '-c', 'ps -o ppid=,tty= -p $$']
  for (let i = 0; i < 12; i++) {
    let out = ''
    try {
      out = (await run(ask)).stdout ?? ''
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
// flat line and all, is launchNameOfListing above).
async function launchNameOn(run: Run, tty: string): Promise<string | null> {
  let out: string
  try {
    out = (await run(['ps', '-t', tty.replace(/^\/dev\//, ''), '-o', 'pid=,command='])).stdout ?? ''
  } catch {
    return null
  }
  return launchNameOfListing(out)
}

// A port of title_in() in hooks/session_name.py:51-72 — seek from the end in
// BLOCK-sized steps, carry the cut first line, answer the LAST custom-title
// entry (a rename comes after the original title) unconditionally: an entry
// that names nothing leaves the session unnamed, it does not resurrect the
// name before it.
export async function lastCustomTitle(sizeOf: SizeOf, readText: ReadText, path: string): Promise<string | null> {
  if (!path) return null
  try {
    const size = await sizeOf(path)
    let carry = ''
    for (let index = Math.max(0, Math.ceil(size / BLOCK) - 1); index >= 0; index--) {
      const chunk = (await readText(path, index)) + carry
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

// read_name() ported (session_name.py:81-92): the tty first — a session with
// none (a headless run) is named by nobody — then the launch name, else the
// transcript's last rename. The readers are the caller's own, built over the $
// the caller's file holds; the walk is this file's, shared by every domain
// that names a session (the guards' gates, the store's row).
export async function walkName(
  run: Run, sizeOf: SizeOf, readText: ReadText, transcriptPath: string,
): Promise<{ tty: string | null; name: string | null }> {
  const tty = await selfTty(run)
  if (!tty) return { tty: null, name: null }
  return { tty, name: (await launchNameOn(run, tty)) ?? await lastCustomTitle(sizeOf, readText, transcriptPath) }
}
