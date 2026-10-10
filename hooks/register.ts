// hooks/register.ts
// Entry point of the hooks module: mounts the domains. Each domain lands in
// its own task; the gauge arrived first, the guards second, the store third,
// the commands fourth. The gauge stays before the supervision: a chain answers
// in registration order, and the store's row reads the figure through the
// gauge's own module memory — mounted after it, the row would carry one
// measure behind.
import { register as registerGauge } from './gauge.ts'
import { register as registerGuards } from './guards.ts'
import { register as registerSupervision } from './supervision.ts'
import { register as registerCommands } from './commands.ts'

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  // The scaffold's own passthrough, now under the every-handler law the four
  // domains below already carry: the net names what the bare handler cannot
  // catch itself, the start is let through, and the state dir says why.
  on('session.start', async ($: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
    .catch(async ($: any, e: any, next: any) => {
      await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
      return next(e)
    })
  registerGauge(on)
  registerGuards(on)
  registerSupervision(on)
  registerCommands(on)
}

// One line in the module's log, the domains' own shape — each file spells its
// env resolution, $ never crossing an import, and the stamp names the half that
// failed. Never throws, never blocks the mount it serves.
async function logLine($: any, message: string): Promise<void> {
  try {
    const config = (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
    const existing = await $.fs.read(`${config}/claude-orchestrator/hooks-module.log`).catch(() => '')
    await $.fs.write(`${config}/claude-orchestrator/hooks-module.log`, `${existing}${new Date().toISOString()} | register | ${message}\n`)
  } catch { /* the log itself never blocks the handler that failed */ }
}
