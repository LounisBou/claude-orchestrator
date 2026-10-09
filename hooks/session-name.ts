// hooks/session-name.ts
// The pure half of the session's naming, ported from hooks/session_name.py: the
// parsers the walk feeds — the role of a name, the value of a custom-title
// entry, the name a flat ps listing was launched with. The walk itself (the
// process table, the transcript's blocks) lives in guards.ts: the engine fences
// $ to the file that received it — never passed across an import, a noun of it
// never read as a value — so every $.noun call is spelled where a handler holds
// it, and only plain data crosses between the files.
const NAME_READABLE_MAX = 40

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
