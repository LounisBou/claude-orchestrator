// hooks/gauge.ts
import { measureFilePath, tripGate, hasFigures, type MeasureReading } from './gauge-core.ts'

// Module memory only — a reload resets both, by design (Review Focus 3): drift is
// announced between two measures of the same load, never re-announced from a stale
// previous model after a hot reload.
let current: MeasureReading | null = null
let lastModel: string | null = null

// The band's input: null until the first measure of a load fills it — the usage
// fields are optional in the shipped types before the first answered turn, so a null
// reading is the expected start, not an error.
export function currentReading(): MeasureReading | null {
  return current
}

export function driftAnnouncement(model: string, previous: string): string {
  // Verbatim from hooks/context-gate.sh:94 — the host can switch the answering
  // model under a session (a refusal, an outage) and no other surface shows it.
  return `MODEL DRIFT: this session now answers as ${model}; it answered as ${previous} until now. The host switched on its own (a refusal, an outage): say it to the operator in your next message; a succession does not repair it.`
}

// Exported for the guards: whatever reads the measure file from a handler resolves
// the config dir through this same seam (the sandbox exposes no process global).
export async function configDir($: any): Promise<string> {
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

// What the band above the prompt says: a plain description, so the rules stay testable
// apart from the surface. The concrete elements come from $.ui.resolve(e) at render
// time; below the gate no rotation line exists, and the quiet band stays one row.
export type BandDescription = {
  label: string
  past: boolean
  note: string | null
}

export function bandTree(reading: MeasureReading | null): BandDescription | null {
  if (!reading) return null
  const past = tripGate(reading.context_percent, reading.context_tokens, reading.context_window).tripped
  const label = `context ${reading.context_percent}% · ${reading.context_tokens.toLocaleString('en-US')}/${reading.context_window.toLocaleString('en-US')}`
  return { label, past, note: past ? 'rotation gate — succeed at the next quiet boundary' : null }
}

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
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
      // Before the first answer the host has no token count yet: nothing is
      // written, and the next measure fills the file.
      if (!hasFigures(reading)) return next(e)
      await writeMeasure($, e.sessionId ?? await $.session.id(), reading)
      if (lastModel !== null && lastModel !== reading.model) {
        await $.ui.toast(driftAnnouncement(reading.model, lastModel))
      }
      lastModel = reading.model
      current = reading
      $.ui.invalidate('ui.render')
    } catch (err) {
      // A measure that fails never blocks: the next turn measures again.
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see:
    // the measure is let through, the state dir says why, and next is
    // replay-safe in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })
  on('session.end', async ($: any, e: any, next: (e: any) => any) => {
    try {
      // $.fs offers no remove: an empty file reads as unmeasured everywhere, and
      // install.sh purges the stale ones.
      await $.fs.write(measureFilePath(await configDir($), e.sessionId ?? await $.session.id()), '')
    } catch (err) {
      // Never blocks the end; the failure is said — one line, the
      // every-handler-logs rule.
      await logLine($, (err as Error).message)
    }
    return next(e)
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see:
    // the end is let through, the state dir says why, and next is replay-safe
    // in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })
  on('ui.render', { component: 'AbovePrompt' }, async ($: any, e: any, next: (e: any) => any) => {
    try {
      // Where nothing draws (a chat panel, a headless run) the band is skipped
      // silently: the gauge stays readable through the measure file and the gate.
      const surfaces = await $.session.surfaces()
      if (!surfaces || surfaces.length === 0) return next(e)
      // The component's own contract: a survey holding the band wins, the hook yields.
      if (e.props.hasSurvey) return next(e)
      const tree = bandTree(currentReading())
      if (!tree) return next(e)
      // A read, not a dispatch: the table is the surface's own, and the tree is
      // returned as the band's drawing — the component's props are read-only, so
      // nothing is written back into e.
      const el = $.ui.resolve(e)
      return el.Box({
        flexDirection: 'column',
        children: [
          el.Text({ color: tree.past ? 'warning' : 'subtle', children: tree.label }),
          ...(tree.note ? [el.Text({ color: 'warning', children: tree.note })] : []),
        ],
      })
    } catch (err) {
      // A band that fails to draw never blocks the render: the engine draws its own.
      await logLine($, (err as Error).message)
      return next(e)
    }
  }).catch(async ($: any, e: any, next: any) => {
    // The registered net the plan's every-handler rule asks validate to see:
    // the render is let through (the engine draws its own band), the state dir
    // says why, and next is replay-safe in a catch, called or not.
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
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
