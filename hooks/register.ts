// hooks/register.ts
// Entry point of the hooks module: mounts the four domains. Each domain lands in
// its own task; the gauge arrived first, the guards' context gate second.
import { register as registerGauge } from './gauge.ts'
import { register as registerGuards } from './guards.ts'

export function register(on: (event: string, handler: Function) => { catch(handler: Function): void }) {
  on('session.start', async ($: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
  registerGauge(on)
  registerGuards(on)
}
