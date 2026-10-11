// hooks/naming.ts
// The session's own rename: a tool the model calls with the house name, and the
// host's own /rename run for it once the turn ends. A session the operator
// starts by hand is named after its directory stem, which no listing reads as a
// role; the model chooses the subject, so the model asks for the name, and the
// module carries it out. The host refuses a command run from a hook the turn is
// waiting on (measured live: a tool.call's run is refused with « run it from a
// later event (turn.complete) »), so the call only records the name and the
// turn's completion runs the rename — the same transcript entry a typed /rename
// writes, the one every name walk reads.

// The tool's short name: the model calls it as mcp__orchestrator__rename_session.
export const RENAME_TOOL = 'rename_session'

// The names a session takes for itself: the two roles a session the operator
// starts by hand declares. An agent and an auditor are named by the launcher at
// spawn, never by themselves. The subject is the launcher's own shape: at most
// twenty-five characters, neither starting nor ending with a space.
const SELF_NAME = /^(Orch|Coord) : (\S(?:.{0,23}\S)?)$/

// The name as asked, or why it is refused: the refusal names the shape, so the
// model's next call can be the right one.
export function checkName(raw: unknown): { name: string } | { refused: string } {
  const name = typeof raw === 'string' ? raw : ''
  if (SELF_NAME.test(name)) return { name }
  return { refused: `a session names itself "Orch : <subject>" or "Coord : <subject>", the subject at most 25 characters and neither starting nor ending with a space, got "${name}"` }
}

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  // Module memory: the name asked during this turn, run at its completion. A
  // second call in the same turn replaces the first — the last word stands.
  let pending: string | null = null

  // The tool is declared at every start: register.ts owns session.start's
  // no-matcher registration, so this one carries the empty matcher. Listed with
  // its schema, never behind the tool search: a model that must search for it
  // first would hand the operator the /rename line instead.
  on('session.start', {}, async ($: any, e: any, next: (e: any) => any) => {
    try {
      await $.tool.register({
        name: RENAME_TOOL,
        isDeferred: false,
        description: 'Renames this session to its role name, "Orch : <subject>" or "Coord : <subject>" (subject at most 25 characters). The name is taken when the current turn ends.',
        inputSchema: {
          type: 'object',
          properties: { name: { type: 'string', description: 'The full name, e.g. "Orch : <subject>"' } },
          required: ['name'],
        },
      })
    } catch (err) {
      // A start never fails on the tool: the session runs, unnamed by itself.
      await logLine($, `rename tool not registered: ${(err as Error).message}`)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  on('tool.call', { tool: `mcp__orchestrator__${RENAME_TOOL}` }, async ($: any, e: any) => {
    const checked = checkName(e.name)
    if ('refused' in checked) return { result: checked.refused, isError: true }
    pending = checked.name
    return { result: `This session is renamed "${checked.name}" when this turn ends.` }
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return { result: 'the rename could not be recorded; hand the operator the /rename line instead', isError: true }
  })

  on('turn.complete', async ($: any, e: any, next: (e: any) => any) => {
    if (pending !== null) {
      const name = pending
      pending = null
      // Not awaited: the run is queued until the session is idle, which this
      // very completion is still holding. Its failure is said in the log.
      $.command.run({ command: 'rename', args: name })
        .catch((err: unknown) => logLine($, `rename to "${name}" failed: ${String((err as Error)?.message ?? err)}`))
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })
}

// The domains' log shape: the config dir resolved here ($ never crosses an
// import), the stamp names this half. Never throws.
async function logLine($: any, message: string): Promise<void> {
  try {
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const existing = await $.fs.read(`${config}/claude-orchestrator/hooks-module.log`).catch(() => '')
    await $.fs.write(`${config}/claude-orchestrator/hooks-module.log`, `${existing}${new Date().toISOString()} | naming | ${message}\n`)
  } catch { /* the log itself never blocks the handler that failed */ }
}
