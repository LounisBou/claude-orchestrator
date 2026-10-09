// hooks/gauge.ts
import { measureFilePath, type MeasureReading } from './gauge-core.ts'

// Module memory only — a reload resets both, by design (Review Focus 3): drift is
// announced between two measures of the same load, never re-announced from a stale
// previous model after a hot reload.
let current: MeasureReading | null = null
let lastModel: string | null = null

export function driftAnnouncement(model: string, previous: string): string {
  // Verbatim from hooks/context-gate.sh:94 — the host can switch the answering
  // model under a session (a refusal, an outage) and no other surface shows it.
  return `MODEL DRIFT: this session now answers as ${model}; it answered as ${previous} until now. The host switched on its own (a refusal, an outage): say it to the operator in your next message; a succession does not repair it.`
}

async function configDir($: any): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

export async function writeMeasure(
  $: { fs: { write(p: string, c: string): Promise<unknown> }; env: { get(name: string): Promise<string | undefined> } },
  sessionId: string,
  reading: MeasureReading,
): Promise<void> {
  // One JSON line; the trailing newline ends it, and a partial line reads as
  // unmeasured everywhere ($.fs.write is not atomic).
  await $.fs.write(measureFilePath(await configDir($), sessionId), JSON.stringify(reading) + '\n')
}

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => unknown) {
  on('session.measure', async ($: any, e: any, next: (e: any) => any) => {
    try {
      const usage = await $.session.usage()
      const model = await $.session.model()
      const reading: MeasureReading = {
        context_tokens: usage.context.tokens,
        context_window: usage.context.window,
        context_percent: usage.context.percent,
        model: String(model ?? 'unavailable'),
        updated_at: new Date().toISOString(),
      }
      await writeMeasure($, e.sessionId ?? await $.session.id(), reading)
      if (lastModel !== null && lastModel !== reading.model) {
        await $.ui.toast(driftAnnouncement(reading.model, lastModel))
      }
      lastModel = reading.model
      current = reading
      $.ui.invalidate('ui.render')
    } catch (err) {
      // A measure that fails never blocks: the next turn measures again.
      await logLine($, `gauge: ${(err as Error).message}`)
    }
    return next(e)
  })
  on('session.end', async ($: any, e: any, next: (e: any) => any) => {
    try {
      // $.fs offers no remove: an empty file reads as unmeasured everywhere, and
      // install.sh purges the stale ones.
      await $.fs.write(measureFilePath(await configDir($), e.sessionId), '')
    } catch { /* never blocks */ }
    return next(e)
  })
}

async function logLine($: any, message: string): Promise<void> {
  try {
    const config = await configDir($)
    const existing = await $.fs.read(`${config}/claude-orchestrator/hooks-module.log`).catch(() => '')
    await $.fs.write(`${config}/claude-orchestrator/hooks-module.log`, `${existing}${new Date().toISOString()} | gauge | ${message}\n`)
  } catch { /* the log itself never blocks the handler that failed */ }
}
