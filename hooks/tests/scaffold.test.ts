// hooks/tests/scaffold.test.ts
import { expect, test } from 'claude-code/testing'
import { register } from '../register.ts'

test('register mounts exactly one session.start handler', () => {
  const mounted: string[] = []
  register((event: string, _handler: Function) => { mounted.push(event) })
  expect(mounted).toEqual(['session.start'])
})
