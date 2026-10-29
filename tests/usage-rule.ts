// tests/usage-rule.ts - the deck's usage rule (hooks/usage.ts) run outside the host, for the
// suite to hold it to routing.py's on the same transcript.
//
//   node tests/usage-rule.ts cost <transcript> <prices.json> [<split>]
//
// Reads the transcript through the module's own reader (appendedArgv, the shell it runs) in
// two reads, the first one ending at byte <split> (half the file by default), then prints
// the tokens and the cost of every message in it, in `routing.py cost --json`'s keys.
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { appendedArgv, consumedOf, ingest, newBook, settle, sumsOf } from '../hooks/usage.ts'

const [mode, transcript, pricesPath, split] = process.argv.slice(2)
if (mode !== 'cost' || !transcript || !pricesPath) {
  process.stderr.write('usage: usage-rule.ts cost <transcript> <prices.json> [<split>]\n')
  process.exit(2)
}

const pricesText = readFileSync(pricesPath, 'utf8')
const book = newBook()
settle(book, Date.now(), JSON.parse(pricesText), pricesText)
const size = statSync(transcript).size
for (const end of [split === undefined ? Math.floor(size / 2) : Number(split), size]) {
  const offset = book.files.get(transcript)?.offset ?? 0
  const [cmd, ...args] = appendedArgv(transcript, offset, end - offset)
  const read = consumedOf(execFileSync(cmd, args, { encoding: 'utf8' }))
  if (!read) throw new Error('the reader gave no answer')
  ingest(book, transcript, offset, read.text, read.consumed)
}
const sums = sumsOf(book.records.values(), book.prices, -Infinity)
process.stdout.write(JSON.stringify({
  offset: book.files.get(transcript)?.offset ?? 0,
  tokens_in: sums.tokens.input, tokens_out: sums.tokens.output,
  cache_read: sums.tokens.cache_read, cache_write: sums.tokens.cache_write,
  cost_usd: sums.cost,
}) + '\n')
