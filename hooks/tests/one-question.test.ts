// hooks/tests/one-question.test.ts
// The one-question-per-turn rule of the stop gate: a final message with two numbered question
// blocks or more is refused, the refusal names the rule; one block or none passes. The blocks
// are the ones round.ts's questionParts recognises, in whatever language it accepts.
import { expect, test } from 'claude-code/testing'
import { oneQuestionRefusal } from '../one-question.ts'
import { TWO_QUESTIONS } from './fixtures.ts'

const BLOCK = (head: string) => [head, '_Subject_ : a thing', '- **A** : yes', '- **B** : no', '_Recommendation_ : A. Safer.'].join('\n')

test('a message with two question blocks is refused, the refusal naming the rule', () => {
  const reason = oneQuestionRefusal([BLOCK('**Question 1 of 2**'), '', BLOCK('**Question 2 of 2**')].join('\n'))
  expect(reason).not.toBeNull()
  expect(reason).toContain('One question per turn')
  expect(reason).toContain('wait for his answer')
  expect(reason).toContain('i of N')
})

test('a message with one question block passes', () => {
  expect(oneQuestionRefusal(BLOCK('**Question 2 of 4**'))).toBeNull()
})

test('a message with no question block passes', () => {
  expect(oneQuestionRefusal('the report\n\nwaiting: operator — blocks: the report')).toBeNull()
  expect(oneQuestionRefusal('')).toBeNull()
})

test('two blocks in two languages are refused', () => {
  expect(oneQuestionRefusal([BLOCK('**Question 1 of 2**'), BLOCK('**Question 2 sur 2**')].join('\n\n'))).not.toBeNull()
  expect(oneQuestionRefusal(TWO_QUESTIONS)).not.toBeNull()
})

test('a bold line that is no numbering is no block', () => {
  expect(oneQuestionRefusal(['**Version 1.2**', '**Version 1.3**'].join('\n'))).toBeNull()
})
