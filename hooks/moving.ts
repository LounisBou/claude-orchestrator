// hooks/moving.ts
// The module moves an orchestrator's files to another machine (the protocol is move.ts's, pure).
// Two tools a supervising session calls: move_send reads the directory of a brief, hashes its
// files, checks that every checkout is clean and pushed, and sends the manifest, the chunks and
// « sent » to a peer; move_probe sends probes of growing sizes to measure the largest message
// that crosses. The receiving half takes every marked delivery out of the chain before a model
// reads it, keeps it under the store, writes each file that arrived whole and checked, and
// answers; the sending half reads the answers. Only two texts ever reach a model: the arrival
// notice, on the receiver, and the notice of the outcome, on the sender.
import { logArgv, LOG_TIMEOUT_MS } from './module-log.ts'
import { roleOf, walkName, hostBasenames, blockArgv, bytesOfBase64, type ReadRecord, type HostNames } from './session-name.ts'
import { withDeadline, isDegradedPass } from './stop-gate.ts'
import { machineLabel } from './remote-row.ts'
import {
  MOVE_CHUNK_DEFAULT, MOVE_TEXT_CAP, MOVE_FILE_CAP, MOVE_MISSING_ROUNDS,
  moveText, parseMoveMessage, chunkText, moveIdOf, checkManifestFiles,
  type ManifestFile, type MoveMessage, type MoveRecord,
} from './move.ts'

export const SEND_TOOL = 'move_send'
export const PROBE_TOOL = 'move_probe'

// The refusal a subagent's call gets: a move is the main thread's.
const MAIN_THREAD_ONLY = "only the session's main thread moves an orchestrator"

// A move is an orchestrator's or a coordinator's to make.
const ROLE_ONLY = 'a move is sent by a session named "Orch : <subject>" or "Coord : <subject>"'

// The largest chunk a call may ask for, so a marked line stays far under the receiver's cap even
// when every character of its data is escaped.
const CHUNK_MAX = Math.floor(MOVE_TEXT_CAP / 8)

// The most probes one call sends, and the longest address it takes.
const PROBES_CAP = 16
const ADDRESS_CAP = 200

// How long the name walk of this file may take.
const NAME_WALK_MS = 3000

// The bound on one process this file starts.
const RUN_MS = 20000
const GIT_MS = 15000

// The names of the sessions that ended a move acknowledged: naming.ts reads whether this
// session may end itself. Set at every mount, so a reload forgets it.
let movedAndAcknowledged = new Set<string>()

// Whether a move this session sent, under its own name, was acknowledged whole by the receiver:
// the one case where a session the launcher opened may end itself.
export function endsAfterMove(): boolean {
  return movedAndAcknowledged.size > 0
}

type Dollar = any

export function register(on: (...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => { catch(handler: Function): void }) {
  movedAndAcknowledged = new Set<string>()

  on('session.start', {}, async ($: Dollar, e: any, next: (e: any) => any) => {
    try {
      await $.tool.register({
        name: SEND_TOOL,
        isDeferred: false,
        description: "Sends an orchestrator's files to another session, module to module: the files of the directory of its brief, in chunks, with their hashes; the receiver's module writes them and answers. Refused unless every checkout is clean and pushed. Calling it again with the same arguments resumes the same move.",
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: "The receiving session's address or name" },
            name: { type: 'string', description: 'The moved orchestrator\'s name, "Orch : <subject>", with no reference' },
            brief: { type: 'string', description: 'Absolute path of its brief, on this machine; the files beside it travel' },
            dir: { type: 'string', description: 'Absolute path of its working directory, on this machine' },
            model: { type: 'string', description: 'The model it runs on' },
            effort: { type: 'string', enum: ['', 'low', 'medium', 'high', 'xhigh', 'max'], description: 'The effort it runs at, or "" for the default' },
            prs: { type: 'array', items: { type: 'string' }, description: 'Its pull requests, one line each' },
            checkouts: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of its checkouts on this machine; each must be clean and pushed' },
            order: { type: 'string', description: "The operator's order, verbatim and dated" },
            chunk: { type: 'integer', description: `Data characters per chunk, ${MOVE_CHUNK_DEFAULT} by default` },
          },
          required: ['to', 'name', 'brief', 'dir', 'model', 'effort', 'prs', 'checkouts', 'order'],
        },
      })
      await $.tool.register({
        name: PROBE_TOOL,
        isDeferred: false,
        description: 'Sends one probe per size to another session; its module answers each with the length it received, and the answers are appended to the store\'s probes file. Measures the largest message that crosses.',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: "The receiving session's address or name" },
            sizes: { type: 'array', items: { type: 'integer' }, description: 'Data characters of each probe' },
          },
          required: ['to', 'sizes'],
        },
      })
    } catch (err) {
      // A start never fails on a tool: the session runs without the move.
      await logLine($, `move tools not registered: ${(err as Error).message}`)
    }
    return next(e)
  }).catch(async ($: Dollar, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return next(e)
  })

  on('tool.call', { tool: `mcp__orchestrator__${SEND_TOOL}` }, async ($: Dollar, e: any) => {
    if (e.agentId) return { result: MAIN_THREAD_ONLY, isError: true }
    const refused = await roleRefusal($)
    if (refused) return { result: refused, isError: true }
    return sendMove($, e)
  }).catch(async ($: Dollar, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return { result: 'the move could not be sent', isError: true }
  })

  on('tool.call', { tool: `mcp__orchestrator__${PROBE_TOOL}` }, async ($: Dollar, e: any) => {
    if (e.agentId) return { result: MAIN_THREAD_ONLY, isError: true }
    const refused = await roleRefusal($)
    if (refused) return { result: refused, isError: true }
    return sendProbes($, e)
  }).catch(async ($: Dollar, e: any, next: any) => {
    await logLine($, `unhandled (${next.error?.kind ?? 'failure'}): ${next.error?.message ?? 'the hook did not finish'}`)
    return { result: 'the probes could not be sent', isError: true }
  })
}

// --- paths -------------------------------------------------------------------------------

async function configDir($: Dollar): Promise<string> {
  return (await $.env.get('CLAUDE_CONFIG_DIR')) ?? `${await $.env.get('HOME')}/.claude`
}

async function movesDir($: Dollar): Promise<string> {
  return `${await configDir($)}/claude-orchestrator/store/moves`
}

// --- the session's own name --------------------------------------------------------------

// The session's name, read the way the other halves read it (a walk over the process table and
// the host's own record), under a bound; null when it is unknown. Each file spells its own
// readers: $ never crosses an import.
async function nameOf($: Dollar): Promise<string | null> {
  const until = Date.now() + NAME_WALK_MS
  const left = () => Math.max(1, until - Date.now())
  const config = await configDir($)
  const sessionId = String(await $.session.id())
  const readRecord: ReadRecord = async (pid: string) => {
    try {
      return String(await $.fs.read(`${config}/sessions/${pid}.json`))
    } catch {
      return null
    }
  }
  const hostNames: HostNames = async () => {
    const host = (await $.env.get('ORCHESTRATOR_HOST_CLI')) ?? 'claude'
    let resolved: string | null = null
    try {
      const found = await $.process.run(['sh', '-c', 'command -v -- "$1"', 'sh', host], { timeoutMs: left() })
      const path = found.exitCode === 0 ? String(found.stdout ?? '').trim() : ''
      if (path.startsWith('/')) resolved = (await $.fs.stat(path, { resolve: true })).realPath ?? path
    } catch { /* unresolved: the spelled name alone */ }
    return hostBasenames(host, resolved)
  }
  try {
    const walked = await withDeadline(walkName(
      (argv: readonly string[]) => $.process.run(argv, { timeoutMs: left() }),
      async (path: string) => (await $.fs.stat(path)).size,
      async (path: string, index: number) => {
        const { exitCode, stdout } = await $.process.run(blockArgv(path, index), { timeoutMs: left() })
        if (exitCode !== 0) throw new Error(`dd exited ${exitCode} on ${path}`)
        return bytesOfBase64(String(stdout ?? ''))
      },
      await transcriptPathOf($, sessionId),
      readRecord,
      hostNames,
      sessionId,
    ), NAME_WALK_MS)
    return isDegradedPass(walked) || !walked.known ? null : walked.name
  } catch {
    return null
  }
}

// The transcript, found by session id under the projects directory: the fallback of a host that
// keeps no record of its sessions. A miss is '', and the walk then names nothing from it.
async function transcriptPathOf($: Dollar, sessionId: string): Promise<string> {
  try {
    const projects = `${await configDir($)}/projects`
    for (const entry of await $.fs.list(projects)) {
      if (entry.kind !== 'dir') continue
      const candidate = `${projects}/${entry.name}/${sessionId}.jsonl`
      if (await $.fs.exists(candidate)) return candidate
    }
  } catch { /* no projects directory: no transcript to name */ }
  return ''
}

// Why this session may not send a move, or null when it may: only an orchestrator or a
// coordinator moves one.
async function roleRefusal($: Dollar): Promise<string | null> {
  const role = roleOf(await nameOf($))
  return role === 'orchestrator' || role === 'coordinator' ? null : ROLE_ONLY
}

// --- the send ----------------------------------------------------------------------------

type Failure = { result: string; isError: true }
const failure = (result: string): Failure => ({ result, isError: true })

type SendInput = { to: string; record: MoveRecord; chunk: number }

const EFFORTS = ['', 'low', 'medium', 'high', 'xhigh', 'max']

// The call's arguments as a record, or the reason they are refused. What the protocol bounds
// (the name's shape, the paths, the order's length) is judged once the manifest is built.
function inputOf(e: any): SendInput | string {
  const text = (v: unknown) => typeof v === 'string' && v.length > 0
  const list = (v: unknown) => Array.isArray(v) && v.every(item => typeof item === 'string')
  if (!text(e.to) || e.to.length > ADDRESS_CAP || /[\u0000-\u001f\u007f]/.test(e.to)) return 'to: the receiving session\'s address or name is required'
  if (!text(e.name)) return 'name: required'
  if (!text(e.brief) || !e.brief.startsWith('/') || e.brief.endsWith('/')) return 'brief: an absolute path of a file is required'
  if (!text(e.dir) || !e.dir.startsWith('/')) return 'dir: an absolute path is required'
  if (!text(e.model)) return 'model: required'
  if (typeof e.effort !== 'string' || !EFFORTS.includes(e.effort)) return `effort: one of ${EFFORTS.map(v => `"${v}"`).join(', ')}`
  if (!list(e.prs)) return 'prs: a list of strings is required'
  if (!list(e.checkouts) || !e.checkouts.every((c: string) => c.startsWith('/'))) return 'checkouts: a list of absolute paths is required'
  if (!text(e.order)) return 'order: the operator\'s order is required'
  const chunk = e.chunk === undefined ? MOVE_CHUNK_DEFAULT : e.chunk
  if (!Number.isInteger(chunk) || chunk < 1 || chunk > CHUNK_MAX) return `chunk: a whole number from 1 to ${CHUNK_MAX}`
  const record: MoveRecord = {
    name: e.name, brief: e.brief, dir: e.dir, model: e.model, effort: e.effort, prs: e.prs, checkouts: e.checkouts,
    git: null, order: e.order,
  }
  return { to: e.to, record, chunk }
}

async function run($: Dollar, argv: string[], timeoutMs = RUN_MS): Promise<{ exitCode: number; stdout: string } | null> {
  try {
    const out = await $.process.run(argv, { timeoutMs })
    return out ? { exitCode: out.exitCode, stdout: String(out.stdout ?? '') } : null
  } catch {
    return null
  }
}

// The sha256 of a file, by the machine's own tool: shasum, else sha256sum.
async function sha256Of($: Dollar, path: string): Promise<string | null> {
  for (const argv of [['shasum', '-a', '256', path], ['sha256sum', path]]) {
    const out = await run($, argv)
    const hash = out?.exitCode === 0 ? /^[0-9a-f]{64}/.exec(out.stdout.trim())?.[0] : undefined
    if (hash) return hash
  }
  return null
}

// A checkout that cannot be left behind: uncommitted work, commits not pushed, or no upstream
// to say whether they are. Code travels by git, so the move waits for it.
async function checkoutRefusal($: Dollar, path: string): Promise<string | null> {
  const status = await run($, ['git', '-C', path, 'status', '--porcelain'], GIT_MS)
  if (!status || status.exitCode !== 0) return `${path}: not a git checkout`
  if (status.stdout.trim() !== '') return `${path}: uncommitted changes, commit and push them first`
  const ahead = await run($, ['git', '-C', path, 'rev-list', '@{u}..HEAD'], GIT_MS)
  if (!ahead || ahead.exitCode !== 0) return `${path}: no upstream branch to tell whether it is pushed`
  if (ahead.stdout.trim() !== '') return `${path}: commits not pushed yet`
  return null
}

// The remote and the branch of the working directory, or null when it is no checkout.
async function gitOf($: Dollar, dir: string): Promise<{ url: string; branch: string } | null> {
  const url = await run($, ['git', '-C', dir, 'remote', 'get-url', 'origin'], GIT_MS)
  const branch = await run($, ['git', '-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], GIT_MS)
  if (!url || url.exitCode !== 0 || !branch || branch.exitCode !== 0) return null
  const [u, b] = [url.stdout.trim(), branch.stdout.trim()]
  return u && b && b !== 'HEAD' ? { url: u, branch: b } : null
}

type Manifest = Extract<MoveMessage, { kind: 'manifest' }>

// The reason a record is refused by the protocol's own shapes, found by taking the git field
// away and then judging the rest, so the reason names what is wrong.
function recordRefusal(manifest: Manifest): string | null {
  if (parseMoveMessage(moveText(manifest))) return null
  if (manifest.record.git && parseMoveMessage(moveText({ ...manifest, record: { ...manifest.record, git: null } }))) {
    return `the remote ${manifest.record.git.url} (branch ${manifest.record.git.branch}) is not an address the protocol carries`
  }
  return 'a field is out of shape: the name ("Orch : <subject>", no reference), the model, the effort, the pull requests, the paths or the order'
}

async function sendMove($: Dollar, e: any): Promise<{ result: string; isError?: true }> {
  const input = inputOf(e)
  if (typeof input === 'string') return failure(input)
  const { to, record, chunk } = input
  for (const path of record.checkouts) {
    const refusal = await checkoutRefusal($, path)
    if (refusal) return failure(`move refused, nothing sent: ${refusal}`)
  }
  const dir = record.brief.slice(0, record.brief.lastIndexOf('/')) || '/'
  const briefName = record.brief.slice(record.brief.lastIndexOf('/') + 1)
  let listed: { name: string; kind: string; size: number; isLink?: boolean }[]
  try {
    listed = await $.fs.list(dir)
  } catch (err) {
    return failure(`move refused, nothing sent: the directory ${dir} cannot be read (${(err as Error).message})`)
  }
  const regular = listed.filter(entry => entry.kind === 'file' && !entry.isLink).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  // The caps first, on the sizes the listing gives, before a byte is read.
  const sketch: ManifestFile[] = regular.map(entry => ({ name: entry.name, bytes: entry.size, sha256: '0'.repeat(64), chunks: 1 }))
  const capped = checkManifestFiles(sketch)
  if (capped) return failure(`move refused, nothing sent: ${capped}`)
  if (!regular.some(entry => entry.name === briefName)) return failure(`move refused, nothing sent: the brief ${briefName} is not a regular file of ${dir}`)
  const files: ManifestFile[] = []
  for (const entry of regular) {
    const path = `${dir}/${entry.name}`
    let text: string
    try {
      text = String(await $.fs.read(path))
    } catch (err) {
      return failure(`move refused, nothing sent: ${entry.name} cannot be read (${(err as Error).message})`)
    }
    const bytes = new TextEncoder().encode(text).length
    if (bytes !== entry.size || bytes > MOVE_FILE_CAP) return failure(`move refused, nothing sent: ${entry.name} is not plain text`)
    const hash = await sha256Of($, path)
    if (!hash) return failure(`move refused, nothing sent: neither shasum nor sha256sum answered for ${entry.name}`)
    files.push({ name: entry.name, bytes, sha256: hash, chunks: chunkText(text, chunk).length })
  }
  record.git = await gitOf($, record.dir)
  const move = moveIdOf(record, files)
  const manifest: Manifest = {
    kind: 'manifest', move,
    origin: { machine: machineLabel(String((await run($, ['hostname', '-s'], 2000))?.stdout ?? '')), home: String(await $.env.get('HOME')), configDir: await configDir($) },
    record, files,
  }
  const refusal = checkManifestFiles(files) ?? recordRefusal(manifest)
  if (refusal) return failure(`move refused, nothing sent: ${refusal}`)
  await keepSend($, { move, to, chunk, record, files, rounds: 0 })
  const failed = await sendAll($, to, manifest, record, files, chunk, null)
  if (failed) return failure(`move ${move} not fully sent: ${failed}; call move_send again with the same arguments to resume it`)
  const chunks = files.reduce((sum, f) => sum + f.chunks, 0)
  const bytes = files.reduce((sum, f) => sum + f.bytes, 0)
  return { result: `move ${move} sent to ${to}: ${files.length} files, ${chunks} chunks, ${bytes} bytes. The receiving module answers by itself; a notice reaches this session when the move is over.` }
}

// What the sender keeps of a move (store/moves/<move>.json): the record, the files, the address
// and the rounds of « missing » answered.
export type SentMove = { move: string; to: string; chunk: number; record: MoveRecord; files: ManifestFile[]; rounds: number }

async function keepSend($: Dollar, sent: SentMove): Promise<void> {
  const dir = await movesDir($)
  await run($, ['mkdir', '-p', dir], 5000)
  await writeAtomic($, `${dir}/${sent.move}.json`, JSON.stringify(sent) + '\n')
}

// Sends the manifest (when given), then the chunks (all of them, or the pairs asked for), then
// « sent ». Returns why it stopped, or null when everything went.
async function sendAll(
  $: Dollar, to: string, manifest: Manifest | null, record: MoveRecord, files: ManifestFile[], chunk: number, only: [number, number][] | null,
): Promise<string | null> {
  const dir = record.brief.slice(0, record.brief.lastIndexOf('/')) || '/'
  const move = manifest?.move ?? ''
  const deliver = async (message: MoveMessage): Promise<string | null> => {
    const sent = await $.session.send({ to, text: moveText(message) })
    return sent?.isDelivered ? null : `not delivered to ${to}: ${sent?.reason ?? 'no answer'}`
  }
  if (manifest) {
    const stopped = await deliver(manifest)
    if (stopped) return stopped
  }
  const wanted = (file: number, index: number) => only === null || only.some(([f, i]) => f === file && i === index)
  for (const [file, f] of files.entries()) {
    if (only !== null && !only.some(([n]) => n === file)) continue
    let pieces: string[]
    try {
      pieces = chunkText(String(await $.fs.read(`${dir}/${f.name}`)), chunk)
    } catch (err) {
      return `${f.name} cannot be read again (${(err as Error).message})`
    }
    if (pieces.length !== f.chunks) return `${f.name} changed since it was announced`
    for (const [index, data] of pieces.entries()) {
      if (!wanted(file, index)) continue
      const stopped = await deliver({ kind: 'chunk', move: manifest?.move ?? moveOfRecord(record, files), file, index, data })
      if (stopped) return stopped
    }
  }
  return deliver({ kind: 'sent', move: move || moveOfRecord(record, files) })
}

function moveOfRecord(record: MoveRecord, files: ManifestFile[]): string {
  return moveIdOf(record, files)
}

// --- the probes --------------------------------------------------------------------------

async function sendProbes($: Dollar, e: any): Promise<{ result: string; isError?: true }> {
  if (typeof e.to !== 'string' || e.to.length === 0 || e.to.length > ADDRESS_CAP || /[\u0000-\u001f\u007f]/.test(e.to)) {
    return failure('to: the receiving session\'s address or name is required')
  }
  const sizes = e.sizes
  if (!Array.isArray(sizes) || sizes.length === 0 || sizes.length > PROBES_CAP
    || !sizes.every(size => Number.isInteger(size) && size >= 1 && size <= MOVE_TEXT_CAP)) {
    return failure(`sizes: one to ${PROBES_CAP} whole numbers from 1 to ${MOVE_TEXT_CAP}`)
  }
  const move = `probe-${Math.floor(Math.random() * 0xffffffffffff).toString(16).padStart(12, '0')}`
  const sent: number[] = []
  for (const size of sizes as number[]) {
    const delivered = await $.session.send({ to: e.to, text: moveText({ kind: 'probe', move, size, data: 'x'.repeat(size) }) })
    if (!delivered?.isDelivered) {
      return failure(`probe ${size} not delivered to ${e.to}: ${delivered?.reason ?? 'no answer'}; sent before it: ${sent.join(', ') || 'none'}`)
    }
    sent.push(size)
  }
  return { result: `probes ${move} sent to ${e.to}: ${sent.join(', ')}. Each answer is appended to ${await movesDir($)}/probes.jsonl by the module.` }
}

// --- the store ---------------------------------------------------------------------------

// Written atomically: a temporary file beside it, then one rename — $.fs.write is not atomic.
async function writeAtomic($: Dollar, path: string, text: string): Promise<void> {
  const tmp = `${path}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await $.fs.write(tmp, text)
  const moved = await $.process.run(['mv', '-f', tmp, path], { timeoutMs: 5000 })
  if (!moved || moved.exitCode !== 0) {
    await $.process.run(['rm', '-f', tmp], { timeoutMs: 5000 }).catch(() => undefined)
    throw new Error(`the file ${path} could not be renamed into place`)
  }
}

// The module's log: the config dir resolved here, the stamp names this half. Never throws.
async function logLine($: Dollar, message: string): Promise<void> {
  try {
    await $.process.run(logArgv($.plugin.root, await configDir($), 'moving', message), { timeoutMs: LOG_TIMEOUT_MS })
  } catch { /* the log itself never blocks the handler that failed */ }
}
