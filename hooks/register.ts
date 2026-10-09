// hooks/register.ts
// Entry point of the hooks module: mounts the four domains. Each domain lands in
// its own task; until then the module only proves the chain loads.
export function register(on: (event: string, handler: Function) => unknown) {
  on('session.start', async ($: unknown, e: unknown, next: (e: unknown) => unknown) => next(e))
}
