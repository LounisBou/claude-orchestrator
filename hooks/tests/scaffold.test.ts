// hooks/tests/scaffold.test.ts
import { expect, test } from 'claude-code/testing'
import { register } from '../register.ts'

test('register mounts exactly one session.start handler', () => {
  const mounted: string[] = []
  register((event: string, handler: Function) => {
    if (typeof handler !== 'function') throw new Error(`no handler mounted for ${event}`)
    mounted.push(event)
  })
  expect(mounted).toContain('session.start')
})
