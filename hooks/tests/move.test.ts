// hooks/tests/move.test.ts
// The protocol that carries an orchestrator's files to another machine (move.ts, pure):
// every kind of marked message read back as it was sent, and a missing, extra, mistyped or
// out-of-bounds field, a wrong marker or a text past the cap refused whole; the manifest's
// checks, the chunks a file travels in, never splitting a character, and the move's id,
// stable over what it carries.
import { expect, test } from 'claude-code/testing'
import {
  MOVE_MARKER, MOVE_TEXT_CAP, MOVE_FILE_CAP, MOVE_FILES_CAP, MOVE_TOTAL_CAP, moveText, isMoveMarked, parseMoveMessage,
  chunkText, moveIdOf, checkManifestFiles,
  type ManifestFile, type MoveMessage, type MoveRecord,
} from '../move.ts'

// A path from its segments. The homes below are written in parts because the suite refuses a
// literal home path anywhere in the plugin; these are placeholders, no machine's own.
const at = (...parts: string[]) => '/' + parts.join('/')
const MAC = { home: at('Users', 'a'), configDir: at('Users', 'a', '.host') }
const LINUX = { home: at('home', 'a'), configDir: at('home', 'a', '.host') }

const SHA = 'a'.repeat(64)

function file(over: Partial<ManifestFile> = {}): ManifestFile {
  return { name: 'belt.md', bytes: 3000, sha256: SHA, chunks: 2, ...over }
}

function record(over: Partial<MoveRecord> = {}): MoveRecord {
  return {
    name: 'Orch : belt', brief: `${MAC.configDir}/orchestrator/briefs/app/belt.md`, dir: `${MAC.home}/dev/app`,
    model: 'a-model', effort: 'high', prs: ['acme/app#7 feat/belt'], checkouts: [`${MAC.home}/dev/app`],
    git: { url: 'git@example.com:acme/app.git', branch: 'feat/belt' },
    order: '2026-10-16T09:04Z: move belt to the other machine and wake it there', ...over,
  }
}

const MOVE = 'belt-0123456789ab'

type Manifest = Extract<MoveMessage, { kind: 'manifest' }>

function manifest(over: Partial<Manifest> = {}): Manifest {
  return {
    kind: 'manifest', move: MOVE, origin: { machine: 'bench-mac', ...MAC }, record: record(),
    files: [file(), file({ name: 'notes.md', bytes: 10, chunks: 1 })], ...over,
  }
}

// One message of every kind, and the variants a kind allows: a refusal and its reason, a
// record with no checkout, no git, no pull request and the default effort.
const SAMPLES: MoveMessage[] = [
  manifest(),
  manifest({ record: record({ effort: '', prs: [], checkouts: [], git: null }) }),
  { kind: 'chunk', move: MOVE, file: 0, index: 1, data: 'line one\n\tline "two"\n' },
  { kind: 'chunk', move: MOVE, file: 1, index: 0, data: '' },
  { kind: 'sent', move: MOVE },
  { kind: 'ack', move: MOVE, file: 1, ok: true, reason: null },
  { kind: 'ack', move: MOVE, file: 0, ok: false, reason: 'the target exists with other content' },
  { kind: 'missing', move: MOVE, chunks: [[0, 1], [1, 0]] },
  { kind: 'done', move: MOVE, ok: true, brief: `${LINUX.configDir}/orchestrator/briefs/app/belt.md`, reason: null },
  { kind: 'done', move: MOVE, ok: false, brief: null, reason: 'the brief is no absolute path' },
  { kind: 'probe', move: MOVE, size: 2048, data: 'x'.repeat(1900) },
  { kind: 'probe-ack', move: MOVE, size: 2048, received: 2048 },
]

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const dig = (o: any, path: readonly (string | number)[]): any => path.reduce((x, k) => x[k], o)

function mistyped(value: unknown): unknown {
  if (typeof value === 'string') return 42
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value === null) return 0
  return Array.isArray(value) ? {} : []
}

// Every copy of a message with one field taken out, one field of the wrong type, or one field
// added, at every level that is an object: the message, and a manifest's origin, record, git
// and first file.
function broken(message: MoveMessage): { label: string; text: string }[] {
  const out: { label: string; text: string }[] = []
  const holders: (string | number)[][] = [[]]
  if (message.kind === 'manifest') holders.push(['origin'], ['record'], ['record', 'git'], ['files', 0])
  for (const path of holders) {
    if (dig(message, path) === null) continue
    for (const key of Object.keys(dig(message, path))) {
      const gone = clone(message)
      delete dig(gone, path)[key]
      out.push({ label: `${[...path, key].join('.')} missing`, text: MOVE_MARKER + JSON.stringify(gone) })
      const wrong = clone(message)
      dig(wrong, path)[key] = mistyped(dig(wrong, path)[key])
      out.push({ label: `${[...path, key].join('.')} mistyped`, text: MOVE_MARKER + JSON.stringify(wrong) })
    }
    const extra = clone(message)
    dig(extra, path).extra = 1
    out.push({ label: `${[...path].join('.')} with an extra field`, text: MOVE_MARKER + JSON.stringify(extra) })
  }
  return out
}

// --- the marked message ----------------------------------------------------------------

for (const message of SAMPLES) {
  test(`a ${message.kind} message is read back as it was sent`, () => {
    const text = moveText(message)
    expect(text.startsWith(MOVE_MARKER)).toBe(true)
    expect(parseMoveMessage(text)).toEqual(message)
    expect(parseMoveMessage(`\n  ${text}\n`)).toEqual(message)
  })
}

for (const message of SAMPLES) {
  test(`a ${message.kind} message with a field missing, extra or mistyped, at any level, is refused`, () => {
    const accepted = broken(message).filter(v => parseMoveMessage(v.text) !== null).map(v => v.label)
    expect(accepted).toEqual([])
  })
}

test('a marked message is told by its head alone, after any leading space', () => {
  expect(isMoveMarked(moveText(SAMPLES[4]))).toBe(true)
  expect(isMoveMarked(`\n ${moveText(SAMPLES[4])}`)).toBe(true)
  expect(isMoveMarked(`a ${MOVE_MARKER}mention inside a sentence`)).toBe(false)
  expect(isMoveMarked('[module-row] {}')).toBe(false)
})

for (const [label, text] of [
  ['another marker', `[module-row] ${JSON.stringify(SAMPLES[4])}`],
  ['no marker', JSON.stringify(SAMPLES[4])],
  ['the marker inside a sentence', `see ${moveText(SAMPLES[4])}`],
  ['not JSON', `${MOVE_MARKER}{oops`],
  ['trailing text after the JSON', `${moveText(SAMPLES[4])} and more`],
  ['an array', `${MOVE_MARKER}[]`],
  ['null', `${MOVE_MARKER}null`],
  ['an unknown kind', `${MOVE_MARKER}${JSON.stringify({ kind: 'push', move: MOVE })}`],
  ['an inherited name as its kind', `${MOVE_MARKER}${JSON.stringify({ kind: 'constructor', move: MOVE })}`],
  ['a prototype key', moveText(SAMPLES[4]).replace('{', '{"__proto__":{"kind":"sent"},')],
] as const) {
  test(`a marked text with ${label} is refused`, () => {
    expect(parseMoveMessage(text)).toBeNull()
  })
}

test('a marked text exactly at the cap is read, one character more is refused whole', () => {
  const head = moveText({ kind: 'probe', move: MOVE, size: MOVE_TEXT_CAP, data: '' }).length
  const full: MoveMessage = { kind: 'probe', move: MOVE, size: MOVE_TEXT_CAP, data: 'x'.repeat(MOVE_TEXT_CAP - head) }
  expect(moveText(full).length).toBe(MOVE_TEXT_CAP)
  expect(parseMoveMessage(moveText(full))).toEqual(full)
  const over = { ...full, data: full.data + 'x' }
  expect(parseMoveMessage(moveText(over))).toBeNull()
})

// The values a peer could forge in a message whose fields are all there and of their type.
const BAD: [string, unknown][] = [
  ['a move id holding a slash', { kind: 'sent', move: 'belt/0123456789ab' }],
  ['a move id holding ..', { kind: 'sent', move: '..-0123456789ab' }],
  ['a move id in capitals', { kind: 'sent', move: 'BELT-0123456789AB' }],
  ['a move id with a short hash', { kind: 'sent', move: 'belt-0123' }],
  ['a move id past its length', { kind: 'sent', move: `${'b'.repeat(41)}-0123456789ab` }],
  ['an origin machine holding a slash', manifest({ origin: { machine: 'a/b', ...MAC } })],
  ['an origin home that is the root', manifest({ origin: { machine: 'bench-mac', home: '/', configDir: MAC.configDir } })],
  ['a relative origin home', manifest({ origin: { machine: 'bench-mac', home: 'Users/a', configDir: MAC.configDir } })],
  ['a relative origin config directory', manifest({ origin: { machine: 'bench-mac', home: MAC.home, configDir: '.host' } })],
  ['a name of another role', manifest({ record: record({ name: 'Coord : belt' }) })],
  ['a name without its role', manifest({ record: record({ name: 'belt' }) })],
  ['a name carrying its reference', manifest({ record: record({ name: 'Orch : belt [a1b2c3]' }) })],
  ['a name past the launcher\'s shape', manifest({ record: record({ name: `Orch : ${'b'.repeat(26)}` }) })],
  ['a name with a double quote', manifest({ record: record({ name: 'Orch : be"lt' }) })],
  ['a name with a dollar', manifest({ record: record({ name: 'Orch : $(belt)' }) })],
  ['a name with a backtick', manifest({ record: record({ name: 'Orch : `belt`' }) })],
  ['a name with a backslash', manifest({ record: record({ name: 'Orch : be\\lt' }) })],
  ['a name with a line break', manifest({ record: record({ name: 'Orch : be\nlt' }) })],
  ['a relative brief', manifest({ record: record({ brief: 'briefs/belt.md' }) })],
  ['a relative directory', manifest({ record: record({ dir: 'dev/app' }) })],
  ['a relative checkout', manifest({ record: record({ checkouts: ['dev/app'] }) })],
  ['a brief with a double quote', manifest({ record: record({ brief: `${MAC.home}/b"x.md` }) })],
  ['a directory with a dollar', manifest({ record: record({ dir: `${MAC.home}/$HOME` }) })],
  ['a checkout with a line break', manifest({ record: record({ checkouts: [`${MAC.home}/a\nb`] }) })],
  ['a path past its length', manifest({ record: record({ dir: `${MAC.home}/${'d'.repeat(1100)}` }) })],
  ['an empty model', manifest({ record: record({ model: '' }) })],
  ['a model with a space', manifest({ record: record({ model: 'a model' }) })],
  ['a model with a semicolon', manifest({ record: record({ model: 'a-model;id' }) })],
  ['an unknown effort', manifest({ record: record({ effort: 'huge' as MoveRecord['effort'] }) })],
  ['a pull request with a line break', manifest({ record: record({ prs: ['acme/app#7\nfeat/belt'] }) })],
  ['an empty pull request', manifest({ record: record({ prs: [''] }) })],
  ['too many pull requests', manifest({ record: record({ prs: Array.from({ length: 51 }, (_, i) => `acme/app#${i + 1}`) }) })],
  ['too many checkouts', manifest({ record: record({ checkouts: Array.from({ length: 51 }, (_, i) => `${MAC.home}/c${i}`) }) })],
  ['a git url that reads as an option', manifest({ record: record({ git: { url: '--upload-pack=x', branch: 'main' } }) })],
  ['a git url through a command transport', manifest({ record: record({ git: { url: 'ext::sh', branch: 'main' } }) })],
  ['a git url with a space', manifest({ record: record({ git: { url: 'https://example.com/a b', branch: 'main' } }) })],
  ['a branch with a space', manifest({ record: record({ git: { url: 'https://example.com/a.git', branch: 'feat belt' } }) })],
  ['a branch that reads as an option', manifest({ record: record({ git: { url: 'https://example.com/a.git', branch: '-f' } }) })],
  ['an empty order', manifest({ record: record({ order: '' }) })],
  ['an order past its length', manifest({ record: record({ order: 'o'.repeat(4001) }) })],
  ['an order with a control character', manifest({ record: record({ order: 'move it\u0007' }) })],
  ['no file', manifest({ files: [] })],
  ['a file name climbing out', manifest({ files: [file({ name: '..' })] })],
  ['a file name with a slash', manifest({ files: [file({ name: 'a/b.md' })] })],
  ['a negative size', manifest({ files: [file({ bytes: -1 })] })],
  ['a fractional size', manifest({ files: [file({ bytes: 1.5 })] })],
  ['a size over the file cap', manifest({ files: [file({ bytes: MOVE_FILE_CAP + 1 })] })],
  ['more chunks than bytes', manifest({ files: [file({ bytes: 3, chunks: 4 })] })],
  ['a fractional chunk count', manifest({ files: [file({ chunks: 1.5 })] })],
  ['a sha256 in capitals', manifest({ files: [file({ sha256: 'A'.repeat(64) })] })],
  ['a file number past the cap', { kind: 'chunk', move: MOVE, file: MOVE_FILES_CAP, index: 0, data: '' }],
  ['a negative chunk index', { kind: 'chunk', move: MOVE, file: 0, index: -1, data: '' }],
  ['a fractional chunk index', { kind: 'chunk', move: MOVE, file: 0, index: 0.5, data: '' }],
  ['a chunk index past the file cap', { kind: 'chunk', move: MOVE, file: 0, index: MOVE_FILE_CAP, data: '' }],
  ['an acknowledgment with a reason', { kind: 'ack', move: MOVE, file: 0, ok: true, reason: 'fine' }],
  ['a refusal with no reason', { kind: 'ack', move: MOVE, file: 0, ok: false, reason: null }],
  ['a refusal with an empty reason', { kind: 'ack', move: MOVE, file: 0, ok: false, reason: '' }],
  ['a reason with a line break', { kind: 'ack', move: MOVE, file: 0, ok: false, reason: 'one\ntwo' }],
  ['a reason past its length', { kind: 'ack', move: MOVE, file: 0, ok: false, reason: 'r'.repeat(2049) }],
  ['nothing missing', { kind: 'missing', move: MOVE, chunks: [] }],
  ['a missing pair of three numbers', { kind: 'missing', move: MOVE, chunks: [[0, 1, 2]] }],
  ['a missing pair with a negative index', { kind: 'missing', move: MOVE, chunks: [[0, -1]] }],
  ['a missing pair past the file count', { kind: 'missing', move: MOVE, chunks: [[MOVE_FILES_CAP, 0]] }],
  ['a done without its brief', { kind: 'done', move: MOVE, ok: true, brief: null, reason: null }],
  ['a done with a reason', { kind: 'done', move: MOVE, ok: true, brief: `${LINUX.home}/b.md`, reason: 'x' }],
  ['a done with a relative brief', { kind: 'done', move: MOVE, ok: true, brief: 'b.md', reason: null }],
  ['a failure with no reason', { kind: 'done', move: MOVE, ok: false, brief: null, reason: null }],
  ['a probe of size zero', { kind: 'probe', move: MOVE, size: 0, data: '' }],
  ['a probe past the cap', { kind: 'probe', move: MOVE, size: MOVE_TEXT_CAP + 1, data: '' }],
  ['a probe answer with a negative count', { kind: 'probe-ack', move: MOVE, size: 2048, received: -1 }],
  ['a probe answer past the cap', { kind: 'probe-ack', move: MOVE, size: 2048, received: MOVE_TEXT_CAP + 1 }],
]

for (const [label, message] of BAD) {
  test(`a marked message with ${label} is refused`, () => {
    expect(parseMoveMessage(MOVE_MARKER + JSON.stringify(message))).toBeNull()
  })
}

// No chunk begins with the low half of a pair or ends with its high half.
const WHOLE = /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/

// --- the chunks ------------------------------------------------------------------------

for (const [label, text, size] of [
  ['ASCII', 'line one\nline two\n', 4],
  ['accents', 'na\u00efve r\u00e9sum\u00e9 fa\u00e7ade', 3],
  ['an emoji across a boundary', 'ab\u{1F600}cd\u{1F600}', 3],
] as const) {
  test(`chunkText rejoins to its input (${label}), each slice within the size and whole`, () => {
    const chunks = chunkText(text, size)
    expect(chunks.join('')).toBe(text)
    expect(chunks.every(c => c.length > 0 && c.length <= size && WHOLE.test(c))).toBe(true)
  })
}

test('chunkText keeps a pair whole where a boundary would cut it', () => {
  expect(chunkText('ab\u{1F600}cd', 3)).toEqual(['ab', '\u{1F600}c', 'd'])
})

test('chunkText gives one empty chunk for an empty text, and one chunk for a text of exactly the size', () => {
  expect(chunkText('', 1536)).toEqual([''])
  expect(chunkText('abcd', 4)).toEqual(['abcd'])
  expect(chunkText('abcde', 4)).toEqual(['abcd', 'e'])
})

test('chunkText at size one carries a pair as one slice of two units, never two halves', () => {
  expect(chunkText('a\u{1F600}b', 1)).toEqual(['a', '\u{1F600}', 'b'])
})

for (const size of [0, -1, Number.NaN, 1.5]) {
  test(`chunkText throws on a size of ${size}`, () => {
    let threw = false
    try {
      chunkText('abc', size)
    } catch {
      threw = true
    }
    expect(threw).toBe(true)
  })
}

// --- the move's id ---------------------------------------------------------------------

const MOVE_ID = /^[a-z0-9-]{1,40}-[0-9a-f]{12}$/

test('moveIdOf reads its subject as a slug, then twelve hex digits', () => {
  const id = moveIdOf(record({ name: 'Orch : Belt wifi probe' }), [file()])
  expect(MOVE_ID.test(id)).toBe(true)
  expect(id.startsWith('belt-wifi-probe-')).toBe(true)
})

test('moveIdOf is stable: the same record and files, in any key order, give the same id', () => {
  const r = record()
  const reordered = Object.fromEntries(Object.entries(r).reverse()) as MoveRecord
  const files = [file(), file({ name: 'notes.md' })]
  expect(moveIdOf(r, files)).toBe(moveIdOf(record(), [file(), file({ name: 'notes.md' })]))
  expect(moveIdOf(reordered, files)).toBe(moveIdOf(r, files))
})

test('moveIdOf changes with one sha256, and with the order', () => {
  const files = [file(), file({ name: 'notes.md' })]
  const one = [file(), file({ name: 'notes.md', sha256: 'a'.repeat(63) + 'b' })]
  expect(moveIdOf(record(), one)).not.toBe(moveIdOf(record(), files))
  expect(moveIdOf(record({ order: 'another order' }), files)).not.toBe(moveIdOf(record(), files))
})

test('moveIdOf folds accents, cuts a long subject to forty characters and never ends its slug on a dash', () => {
  expect(moveIdOf(record({ name: 'Orch : Na\u00efve r\u00e9sum\u00e9' }), [file()]).startsWith('naive-resume-')).toBe(true)
  const long = moveIdOf(record({ name: `Orch : ${'abcdefghi '.repeat(4)}xyz` }), [file()])
  expect(MOVE_ID.test(long)).toBe(true)
  expect(long.slice(0, -13)).toBe('abcdefghi-abcdefghi-abcdefghi-abcdefghi')
})

test('moveIdOf falls back to a slug of its own when the subject holds no letter or digit', () => {
  const id = moveIdOf(record({ name: 'Orch : \u{1F600}\u{1F600}' }), [file()])
  expect(MOVE_ID.test(id)).toBe(true)
})

// --- the manifest's files --------------------------------------------------------------

test('checkManifestFiles takes a plain set, and the caps exactly reached', () => {
  expect(checkManifestFiles([file(), file({ name: 'notes.md', bytes: 0, chunks: 1 })])).toBeNull()
  expect(checkManifestFiles([file({ bytes: MOVE_FILE_CAP })])).toBeNull()
  const full = Array.from({ length: MOVE_FILES_CAP }, (_, i) => file({ name: `f${i}.md`, bytes: MOVE_TOTAL_CAP / MOVE_FILES_CAP }))
  expect(checkManifestFiles(full)).toBeNull()
})

for (const [label, files] of [
  ['no file', []],
  ['more files than the cap', Array.from({ length: MOVE_FILES_CAP + 1 }, (_, i) => file({ name: `f${i}.md`, bytes: 1, chunks: 1 }))],
  ['a file over the cap', [file({ bytes: MOVE_FILE_CAP + 1 })]],
  ['a total over the cap', Array.from({ length: 5 }, (_, i) => file({ name: `f${i}.md`, bytes: MOVE_FILE_CAP }))],
  ['a name with a slash', [file({ name: 'a/b.md' })]],
  ['a name with a space', [file({ name: 'a b.md' })]],
  ['an empty name', [file({ name: '' })]],
  ['the name .', [file({ name: '.' })]],
  ['the name ..', [file({ name: '..' })]],
  ['a duplicate name', [file(), file()]],
  ['an uppercase sha256', [file({ sha256: 'A'.repeat(64) })]],
  ['a short sha256', [file({ sha256: 'a'.repeat(63) })]],
  ['no chunk', [file({ chunks: 0 })]],
] as const) {
  test(`checkManifestFiles refuses ${label}, with its reason`, () => {
    const reason = checkManifestFiles(files as unknown as ManifestFile[])
    expect(typeof reason).toBe('string')
    expect((reason ?? '').length > 0).toBe(true)
  })
}
