// hooks/session-name.ts
// Ported from hooks/session_name.py: the launch name from the process table, else
// the last custom-title entry of the transcript, read from the end in blocks.
const BLOCK = 65536

// The launcher's own bound (iterm_agent.py): past this, what the process table
// hands back is a launch line, not a name, and reads as no name at all.
const NAME_READABLE_MAX = 40

export function roleOf(name: string | null): 'orchestrator' | 'agent' | 'auditor' | 'coordinator' | null {
  if (!name) return null
  if (name.startsWith('Orch :')) return 'orchestrator'
  if (name.startsWith('Agent :')) return 'agent'
  if (name.startsWith('Audit :')) return 'auditor'
  if (name.startsWith('Coord :')) return 'coordinator'
  return null
}

// $.fs.read carries no range — the API's own types offer only { as }, and a
// whole read is refused past 4 MiB while transcripts grow past any cap — so a
// block comes from dd through $.process.run: one bounded window per step,
// never the whole file, and every line before the one that matched stays
// unread. dd counts its windows from the file's start, so the blocks are
// aligned there; that changes only which bytes share a read, never what is
// scanned, and the short window is the one holding the file's end.
async function readRange($: any, path: string, index: number): Promise<string> {
  const { exitCode, stdout } = await $.process.run(['dd', `if=${path}`, `bs=${BLOCK}`, `skip=${index}`, 'count=1'])
  if (exitCode !== 0) throw new Error(`dd exited ${exitCode} on ${path}`)
  return stdout
}

export async function lastCustomTitle($: any, path: string): Promise<string | null> {
  // A port of title_in() in hooks/session_name.py:51-72 — seek from the end in
  // BLOCK-sized steps, carry the cut first line, answer the LAST custom-title
  // entry (a rename comes after the original title).
  const isTitle = (line: string) => /"type"\s*:\s*"custom-title"/.test(line)
  const titleOf = (line: string) => {
    const m = line.match(/"customTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/)
    return m ? JSON.parse(`"${m[1]}"`) as string : null
  }
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
      out = (await $.process.run(ask)).stdout.trim()
    } catch {
      return null
    }
    if (!out) return null
    const [ppid = '', tty = ''] = out.split(/\s+/)
    if (tty && tty !== '??' && tty !== '-') return `/dev/${tty}`
    if (!/^\d+$/.test(ppid) || Number(ppid) <= 1) return null
    ask = ['ps', '-p', ppid, '-o', 'ppid=,tty=']
  }
  return null
}

// session_name_on() ported (iterm_agent.py): the name the session on a tty was
// launched with, from the same listing the launcher prints. ps hands back a
// FLAT command line — the quoting that made the name one argument is gone, and
// the launcher puts --name last precisely so the words after it run to the end
// of the line.
async function launchNameOn($: any, tty: string): Promise<string | null> {
  let out: string
  try {
    out = (await $.process.run(['ps', '-t', tty.replace(/^\/dev\//, ''), '-o', 'pid=,command='])).stdout
  } catch {
    return null
  }
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

export async function readName($: any, transcriptPath: string): Promise<{ tty: string | null; name: string | null }> {
  // read_name() ported (session_name.py:81-92): the tty first — a session with
  // none (a headless run) is named by nobody — then the launch name, else the
  // transcript's last rename.
  const tty = await selfTty($)
  if (!tty) return { tty: null, name: null }
  return { tty, name: (await launchNameOn($, tty)) ?? await lastCustomTitle($, transcriptPath) }
}
