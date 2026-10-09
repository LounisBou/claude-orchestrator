// hooks/register.ts
// Entry point of the hooks module: mounts the four domains. Each domain lands in
// its own task; the gauge is the first to arrive.
import { register as registerGauge } from './gauge.ts'

export function register(on: (event: string, handler: Function) => unknown) {
  on('session.start', async ($: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
  registerGauge(on)
}
