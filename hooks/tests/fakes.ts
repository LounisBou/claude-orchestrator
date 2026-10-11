// hooks/tests/fakes.ts
// What every fake $ answers the same way: the module's log line, appended through
// hooks/log-append.sh by $.process.run (module-log.ts) — never a $.fs write. A fake
// hands each run here first; a log run is captured and answered, anything else is the
// fake's own.
export function logLineOf(argv: readonly string[]): string | null {
  return argv[0] === 'sh' && String(argv[1] ?? '').endsWith('/hooks/log-append.sh') ? String(argv[3] ?? '') : null
}
