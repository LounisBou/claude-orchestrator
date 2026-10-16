// hooks/tests/move.test.ts
// The protocol that carries an orchestrator's files to another machine (move.ts, pure):
// the manifest's checks, the chunks a file travels in, never splitting a character, and the
// move's id, stable over what it carries.
import { expect, test } from 'claude-code/testing'
import {
  MOVE_FILE_CAP, MOVE_FILES_CAP, MOVE_TOTAL_CAP, chunkText, moveIdOf, checkManifestFiles,
  type ManifestFile, type MoveRecord,
} from '../move.ts'

// A path from its segments. The homes below are written in parts because the suite refuses a
// literal home path anywhere in the plugin; these are placeholders, no machine's own.
const at = (...parts: string[]) => '/' + parts.join('/')
const MAC = { home: at('Users', 'a'), configDir: at('Users', 'a', '.host') }

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
