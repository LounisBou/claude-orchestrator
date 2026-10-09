// hooks/tests/gauge-band.test.ts
import { expect, test } from 'claude-code/testing'
import { bandTree, currentReading, register as registerGauge } from '../gauge.ts'

test('below the gate the band shows the fill without warning color', () => {
  const tree = bandTree({ context_percent: 42, context_tokens: 42000, context_window: 100000, model: 'a-model', updated_at: 't' })
  expect(JSON.stringify(tree)).toContain('42%')
  expect(JSON.stringify(tree)).not.toContain('rotation')
})

test('past the gate the band names the rotation', () => {
  const tree = bandTree({ context_percent: 84, context_tokens: 84000, context_window: 100000, model: 'a-model', updated_at: 't' })
  expect(JSON.stringify(tree)).toContain('84%')
  expect(JSON.stringify(tree)).toContain('rotation gate')
})

test('a session nothing has measured yet draws no band', () => {
  // The other half of the nothing-drawn case: the usage fields are optional before the
  // first answered turn, so the reading stays null and the band is absent, not empty.
  expect(bandTree(null)).toBeNull()
})

test('the band skips when nothing draws, and draws the fill when something does', async () => {
  const handlers: Record<string, Function> = {}
  registerGauge((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    handlers[args[0]] = args[args.length - 1] as Function
  })
  let surfaces: readonly string[] = []
  const $ = {
    session: {
      usage: async () => ({ context: { tokens: 84000, window: 100000, percent: 84 } }),
      model: async () => 'a-model',
      id: async () => 's1',
      surfaces: async () => surfaces,
    },
    fs: { write: async () => undefined },
    env: { get: async (name: string) => (name === 'HOME' ? '/tmp/h' : undefined) },
    ui: {
      toast: () => undefined,
      invalidate: () => undefined,
      resolve: (_e: unknown) => ({
        Box: (props: { flexDirection?: string; children?: unknown[] }) => ({ type: 'Box', props }),
        Text: (props: { color?: string; children?: string }) => ({ type: 'Text', props }),
      }),
    },
  }
  const through = (e: unknown) => ({ passed: e })
  const render = (e: object) => handlers['ui.render']($, e, through)

  // A session that draws nothing (a chat panel, a headless run) passes through
  // silently instead of throwing, whatever the reading is.
  const quiet = await render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'r1', props: { hasSurvey: false } })
  expect(quiet).toEqual({ passed: { surface: 'terminal', component: 'AbovePrompt', requestId: 'r1', props: { hasSurvey: false } } })

  // A measure fills the reading the band draws from.
  await handlers['session.measure']($, {}, (e: unknown) => e)
  expect(currentReading()).toMatchObject({ context_percent: 84 })

  surfaces = ['terminal']
  const tree = await render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'r2', props: { hasSurvey: false } })
  expect(JSON.stringify(tree)).toContain('84%')
  expect(JSON.stringify(tree)).toContain('rotation gate')
  expect(JSON.stringify(tree)).toContain('warning')

  // The component's own contract: a survey holding the band wins, the hook yields.
  const held = await render({ surface: 'terminal', component: 'AbovePrompt', requestId: 'r3', props: { hasSurvey: true } })
  expect(held).toEqual({ passed: { surface: 'terminal', component: 'AbovePrompt', requestId: 'r3', props: { hasSurvey: true } } })
})
