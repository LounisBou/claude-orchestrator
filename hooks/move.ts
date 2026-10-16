// hooks/move.ts
// An orchestrator's files, carried to another machine. An orchestrator asleep on one machine
// is woken on another: the directory of its brief travels from one session's module to
// another's over the host's peer messages, each one a marked line the receiving module takes
// out of the delivery before any model reads it, as the remote rows do (remote-row.ts). The
// sender announces the files in a manifest — each one's size, hash and chunk count, the
// origin's home and config directory — sends every chunk, then says it has sent; the
// receiver joins each file, checks its hash, rewrites the origin's paths into its own,
// acknowledges it, and asks again for what is missing. Code never travels this way: it goes
// by git. Pure on purpose: the handlers hold the $ and pass their reads in here, and the
// files' hashes are computed by a process, outside this file.

// The line's fixed head: what the receiver keys on, and nothing a person or a model writes by
// chance.
export const MOVE_MARKER = '[module-move] '

// The receiver's cap on one marked message.
export const MOVE_TEXT_CAP = 1_048_576        // a longer marked message is refused whole, never cut

// How much of a file one chunk carries until a live probe measures the largest message that
// crosses (a 2048-character row is known to): the sender takes another size when told.
export const MOVE_CHUNK_DEFAULT = 1536        // data characters per chunk

// No file the host cannot read or write whole travels.
export const MOVE_FILE_CAP = 4 * 1024 * 1024  // the host's file read and write limit

// The most one move carries, its files together and their count: a briefs directory holds a
// few hundred kilobytes, and a move past either cap is refused before anything is sent.
export const MOVE_TOTAL_CAP = 16 * 1024 * 1024
export const MOVE_FILES_CAP = 512

// No timer: the sender resends what a « missing » answer names, this many answers per move at
// most, then reports the failure. The same send repeated resumes the same move.
export const MOVE_MISSING_ROUNDS = 3

// What a move carries of the orchestrator: the sleeping record's fields, the remote of its
// directory, and the operator's order. Paths are the origin machine's.
export type MoveRecord = {
  name: string                 // "Orch : <subject>", no [ref]
  brief: string                // absolute, origin machine
  dir: string                  // absolute, origin machine
  model: string
  effort: '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  prs: string[]
  checkouts: string[]          // absolute, origin machine; code travels by git
  git: { url: string; branch: string } | null   // dir's origin remote and branch; null when dir is no checkout
  order: string                // the operator's order, verbatim and dated
}
export type Origin = { machine: string; home: string; configDir: string }
export type ManifestFile = { name: string; bytes: number; sha256: string; chunks: number }  // name: a base name in dirname(brief)

// A file's name: one plain base name, so it is written beside the brief and nowhere else.
const FILE_NAME_SHAPE = /^[A-Za-z0-9._-]+$/
const SHA256_SHAPE = /^[0-9a-f]{64}$/

// A move's id: the subject's slug, then twelve hex digits of a hash.
const SLUG_CAP = 40
const SLUG_FALLBACK = 'move'

// The text's slices, at most `size` UTF-16 units each, a surrogate pair never cut: a slice
// that would end on a pair's high half ends before it, and at size one the pair is the
// slice. An empty text is one empty chunk, so every file has at least one.
export function chunkText(text: string, size: number): string[] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunkText: the size must be a whole number of at least 1, got ${size}`)
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + size, text.length)
    if (end < text.length && isHighHalf(text.charCodeAt(end - 1)) && isLowHalf(text.charCodeAt(end))) {
      end = end - 1 > start ? end - 1 : end + 1
    }
    chunks.push(text.slice(start, end))
    start = end
  }
  return chunks.length > 0 ? chunks : ['']
}

function isHighHalf(unit: number): boolean {
  return unit >= 0xd800 && unit <= 0xdbff
}

function isLowHalf(unit: number): boolean {
  return unit >= 0xdc00 && unit <= 0xdfff
}

// The move's id: the same record and files give the same id, so a send repeated resumes the
// move it repeats. The hash runs over the fields in a fixed order, never over the objects'
// own key order.
export function moveIdOf(record: MoveRecord, files: ManifestFile[]): string {
  const canonical = JSON.stringify([
    record.name, record.brief, record.dir, record.model, record.effort, record.prs, record.checkouts,
    record.git ? [record.git.url, record.git.branch] : null, record.order,
    files.map(f => [f.name, f.bytes, f.sha256, f.chunks]),
  ])
  return `${slugOf(record.name)}-${hex48(canonical)}`
}

// The subject after the role's prefix, accents folded, every other run of characters a dash.
function slugOf(name: string): string {
  const subject = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
  const slug = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, SLUG_CAP).replace(/-+$/, '')
  return slug || SLUG_FALLBACK
}

// FNV-1a over the text's UTF-16 units, 64 bits wide, its top 48 bits as twelve hex digits:
// an id, not a proof, so no cryptographic hash is needed.
const FNV_OFFSET = 0xcbf29ce484222325n
const FNV_PRIME = 0x100000001b3n
const MASK_64 = (1n << 64n) - 1n

function hex48(text: string): string {
  let hash = FNV_OFFSET
  for (let i = 0; i < text.length; i++) hash = ((hash ^ BigInt(text.charCodeAt(i))) * FNV_PRIME) & MASK_64
  return (hash >> 16n).toString(16).padStart(12, '0')
}

// The manifest's files against the caps and the shapes: null when they hold, else the first
// reason found. A name is checked before anything else of its file, so a reason only ever
// quotes a name of the plain shape.
export function checkManifestFiles(files: ManifestFile[]): string | null {
  if (files.length === 0) return 'no file to move'
  if (files.length > MOVE_FILES_CAP) return `${files.length} files, more than ${MOVE_FILES_CAP}`
  const seen = new Set<string>()
  let total = 0
  for (const [i, f] of files.entries()) {
    if (!FILE_NAME_SHAPE.test(f.name) || f.name === '.' || f.name === '..') return `file ${i}: its name is no plain base name`
    if (seen.has(f.name)) return `${f.name}: a duplicate name`
    seen.add(f.name)
    if (!(f.bytes <= MOVE_FILE_CAP)) return `${f.name}: ${f.bytes} bytes, more than ${MOVE_FILE_CAP}`
    if (!SHA256_SHAPE.test(f.sha256)) return `${f.name}: its sha256 is not 64 lowercase hex digits`
    if (!(f.chunks >= 1)) return `${f.name}: ${f.chunks} chunks, fewer than one`
    total += f.bytes
  }
  if (total > MOVE_TOTAL_CAP) return `${total} bytes in all, more than ${MOVE_TOTAL_CAP}`
  return null
}
