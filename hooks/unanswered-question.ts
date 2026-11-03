// hooks/unanswered-question.ts
// The stop gate's rule on a question still on the operator, the operator's ruling of 2026-11-03:
// an orchestrator asks the coordinator (its pane, or its session when the pane is closed) and,
// at the same time, its own chat, where he must see the question too, at every turn's end until
// he answers it. A question once asked and then lost from the chat left him unaware of what the
// orchestrator waited on. Pure: the stop gate reads the round and the session's wait file, this
// file decides on what they hold and on the turn's final message.
import { entryQuestions, questionParts, questionShape, parseChoices, plainText, numberLabel, type RoundEntry, type QuestionShape } from './round.ts'
import { heldQuestion, type RelayedWait } from './relay.ts'
import { outsideFences } from './one-question.ts'

// The answer an entry withdrawn by the operator's prompt in its sender's own tab records.
const TAB_ANSWER = "answered in the sender's own tab"

// The session's wait file as this rule reads it: the wait, the fingerprint the coordinator
// holds, a send not yet acknowledged by a coordinator on another machine, and the mark of a
// prompt the operator typed in this turn while the question was held.
export type WaitRead = RelayedWait & { pending?: string | null; typed?: { blocks: string; since: string | null } | null }

// The question still on the operator: its round entry when this machine's round holds it, else
// only what the wait file knows of it (its blocks and its start).
export type Pending = { entry: RoundEntry | null; blocks: string; since: string | null }

// The session's question the operator has not answered, the earliest when several (one question
// per turn: the others wait behind it). An operator entry of the session still open; or one
// withdrawn as answered in its own tab during this very turn (the wait file's mark of his prompt
// names it): what he typed may have been about something else, and only a « Recorded » line
// says he answered. An entry with no numbered question block asks nothing the chat could show
// again and is passed over. With no such entry in this machine's round, the wait file's operator
// wait relayed to a coordinator elsewhere (held, sent and not yet acknowledged, or marked by his
// prompt) is the question; an entry of the same wait in the round, whatever its status, rules
// instead: an answer from the pane or the coordinator settles it.
export function pendingQuestion(sessionId: string, entries: readonly RoundEntry[], wait: WaitRead | null): Pending | null {
  const typed = wait?.typed ?? null
  const markedByPrompt = (entry: RoundEntry) => typed !== null && entry.blocks === typed.blocks && entry.since === typed.since
    && (entry.answer?.by === 'tab' || (entry.answer?.text ?? '').includes(TAB_ANSWER))
  const own = entries.filter(entry => entry.session === sessionId && entry.kind === 'operator')
  const open = own
    .filter(entry => entry.status === 'open' || markedByPrompt(entry))
    .filter(entry => askedPart(entry) !== null)
    .sort((a, b) => (a.since < b.since ? -1 : a.since > b.since ? 1 : 0))
  if (open.length > 0) return { entry: open[0], blocks: open[0].blocks ?? '', since: open[0].since }
  const held = wait ? heldQuestion(wait) ?? sentQuestion(wait) ?? typed : null
  if (!held || held.blocks === '') return null
  if (own.some(entry => entry.blocks === held.blocks && entry.since === held.since)) return null
  return { entry: null, blocks: held.blocks, since: held.since }
}

// An operator wait sent to a coordinator on another machine and not acknowledged yet.
function sentQuestion(wait: WaitRead): { blocks: string; since: string | null } | null {
  if (wait.waiting !== 'operator' || !wait.pending || typeof wait.blocks !== 'string') return null
  return { blocks: wait.blocks, since: wait.waiting_since ?? null }
}

// The entry's question still unanswered: its first numbered question the pane has not answered
// yet (`partial` holds the answers given so far, in order), with its shape; null when none is.
function askedPart(entry: RoundEntry): { number: string; shape: QuestionShape; choices: RoundEntry['choices'] } | null {
  const numbered = entryQuestions(entry).filter(part => part.number !== null)
  const part = numbered[entry.partial?.length ?? 0]
  if (!part) return null
  const shape = questionShape(part.question, part.choices)
  return shape ? { number: part.number!, shape, choices: part.choices } : null
}

// A line that records the operator's answer, `Recorded: <his ruling>` in the sender's language
// (« Enregistré », « Enregistrée »), its markup around the word allowed.
const RECORDED = /^[\s>*_`«"-]*(?:recorded|enregistr[ée]e?s?)[\s*_`»"]*:/iu

// A text as compared: its emphasis dropped, its spacing collapsed, its case kept.
const flat = (text: string) => plainText(text).replace(/\s+/g, ' ').trim()

// The refusal for a turn that ends while the session's question is still on the operator and
// shows him neither that question in full nor a « Recorded » line ruling on it; null otherwise.
// In full: a numbered block of the message, outside code fences, with the same numbering, every
// labelled field of the entry's question with its label and its text, every choice with its
// letter and text, and the recommendation. With only the wait file's knowledge of the question,
// any numbered block with labelled fields is taken for it.
export function unansweredRefusal(message: string, pending: Pending | null): string | null {
  if (pending === null) return null
  const text = outsideFences(message)
  if (text.split('\n').some(line => RECORDED.test(line))) return null
  const shown = questionParts(text).map(part => {
    const { choices } = parseChoices(part)
    return { shape: questionShape(part, choices), choices }
  })
  const asked = pending.entry ? askedPart(pending.entry) : null
  if (asked === null) {
    if (shown.some(part => part.shape?.number)) return null
    return refusal(`blocks: ${pending.blocks}`, pending.blocks)
  }
  const same = shown.some(({ shape, choices }) => shape !== null && shape.number !== null
    && numberLabel(shape.number) === numberLabel(asked.number)
    && asked.shape.fields.every(field => shape.fields.some(seen => flat(seen.label).toLowerCase() === flat(field.label).toLowerCase() && flat(seen.text) === flat(field.text)))
    && asked.choices.every(choice => choices.some(seen => seen.letter === choice.letter && flat(seen.text) === flat(choice.text)))
    && (asked.shape.recommendation === null || flat(shape.recommendation?.text ?? '') === flat(asked.shape.recommendation.text)))
  if (same) return null
  const question = asked.shape.fields.find(field => /^question$/i.test(flat(field.label)))?.text
  return refusal(`**${asked.number}** — ${flat(question ?? pending.blocks)}`, pending.blocks)
}

function refusal(named: string, blocks: string): string {
  return `Your question to the operator is still unanswered: « ${named} ». He must see it in your own chat as well as `
    + 'in the coordinator\'s round, at every turn\'s end until he answers it (his ruling of 2026-11-03). Present it again '
    + 'IN FULL in this message, in the shape of orchestrator:decide step 2 — its `**Question i of N**` line and every '
    + 'labelled field, its choices and its recommendation, as you asked it — and end the turn on its wait line again, '
    + `\`waiting: operator — blocks: ${blocks}\`. If he answered it in this tab, write the « Recorded: <his ruling> » line `
    + 'instead, as step 4 says.'
}
