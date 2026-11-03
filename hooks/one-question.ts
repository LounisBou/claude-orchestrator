// hooks/one-question.ts
// The stop gate's one-question rule: an orchestrator puts one question to the operator per
// turn, the next one only after his answer. A final message holding two numbered question
// blocks or more breaks it. The blocks are the ones round.ts's questionParts splits an entry
// on (`**Question 3 of 4**`, in the sender's language): the numbering is read there, once.
import { questionParts } from './round.ts'

export const ONE_QUESTION =
  'One question per turn: this message holds several numbered question blocks. Put the first to the operator '
  + 'alone, in the shape of orchestrator:decide, and let the others wait for his answer: ask the next in the '
  + 'turn that follows it. The numbering « i of N » still says how many questions there are.'

// The refusal for a message with two question blocks or more; null for one block or none.
export function oneQuestionRefusal(message: string): string | null {
  return questionParts(message).length > 1 ? ONE_QUESTION : null
}
