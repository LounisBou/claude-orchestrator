// hooks/register.ts
// Entry point of the hooks module: mounts the domains. Each domain lands in
// its own task; the gauge arrived first, the guards second, the store third.
// The gauge stays before the supervision: a chain answers in registration
// order, and the store's row reads the figure through the gauge's own module
// memory — mounted after it, the row would carry one measure behind.
import { register as registerGauge } from './gauge.ts'
import { register as registerGuards } from './guards.ts'
import { register as registerSupervision } from './supervision.ts'

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  on('session.start', async ($: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
  registerGauge(on)
  registerGuards(on)
  registerSupervision(on)
}
