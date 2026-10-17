// hooks/tests/moving.test.ts
// The module moves an orchestrator's files (moving.ts, over the protocol of move.ts): the two
// tools a supervising session calls, refused to anyone else; the sender that reads a briefs
// directory, hashes it, checks the checkouts and sends manifest, chunks and « sent »; the
// receiver that takes every marked delivery out of the chain before a model reads it, joins,
// checks, rewrites and writes each file, acknowledges it and asks again for what is missing;
// the sender's answers to « missing » and « done »; the probes; and the one case where a
// session the launcher opened may end itself.
import { expect, test } from 'claude-code/testing'
import { register as registerMoving } from '../moving.ts'
import { register as registerNaming, END_TOOL } from '../naming.ts'
import {
  MOVE_CHUNK_DEFAULT, MOVE_MISSING_ROUNDS, moveText, parseMoveMessage, chunkText, moveIdOf, arrivalOf, arrivedNotice,
  acknowledgedNotice, failedNotice, type MoveMessage,
} from '../move.ts'
import { logLineOf } from './fakes.ts'

// The homes are written in parts: the suite refuses a literal home path anywhere in the plugin.
const at = (...parts: string[]) => '/' + parts.join('/')
const HOME_A = at('Users', 'a')
const HOME_B = at('home', 'b')
const ADDRESS_A = 'bridge:session_01SenderA'
const ADDRESS_B = 'bridge:session_02ReceiverB'
const LAUNCHER = '/plugins/orch-root/skills/iterm-agents/scripts/iterm-agent.sh'

// The fake machine's hash tool: not a real sha256, a deterministic 64-digit digest of the text
// (the module only compares what two machines' tools say).
function sha256(text: string): string {
  let out = ''
  for (let round = 0; out.length < 64; round++) {
    let h = 0xcbf29ce484222325n ^ BigInt(round)
    for (let i = 0; i < text.length; i++) h = ((h ^ BigInt(text.charCodeAt(i))) * 0x100000001b3n) & 0xffffffffffffffffn
    out += h.toString(16).padStart(16, '0')
  }
  return out.slice(0, 64)
}

type Repo = { dirty?: boolean; ahead?: number; noUpstream?: boolean; remote?: string; branch?: string }

type Options = {
  home: string
  name?: string | null              // the session's own name, as the process table spells it
  address: string
  machine?: string
  spawned?: boolean
  noShasum?: boolean
  noSha256sum?: boolean
  repos?: Record<string, Repo>
  // Addresses a send cannot reach; every other send is delivered.
  unreachable?: string[]
}

// A complete fake $ over an in-memory file map: the machine's files, its process table as far as
// the name walk reads it, the hash tools, the git of its checkouts, and the messages it sends.
function machine(options: Options) {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const links = new Set<string>()
  const sent: { to: string; text: string }[] = []
  const submits: { text: string }[] = []
  const logged: string[] = []
  const writes: string[] = []
  const runs: string[] = []
  const registered: any[] = []
  const config = `${options.home}/.claude`
  const env: Record<string, string | undefined> = {
    HOME: options.home, ORCHESTRATOR_HOST_CLI: 'hostcli', ORCHESTRATOR_SPAWNED: options.spawned ? '1' : undefined,
  }
  const name = options.name === undefined ? 'Orch : belt' : options.name
  const dollar: any = {
    session: {
      id: async () => 's-one',
      send: async (args: { to: string; text: string }) => {
        if (options.unreachable?.includes(args.to)) return { isDelivered: false, reason: 'no such session' }
        sent.push(args)
        return { isDelivered: true }
      },
    },
    env: { get: async (key: string) => env[key] },
    plugin: { name: 'orchestrator', root: '/plugins/orch-root' },
    tool: { register: async (spec: any) => { registered.push(spec); return {} } },
    prompt: { submit: (input: { text: string }) => { submits.push(input); return Promise.resolve({ text: input.text }) } },
    fs: {
      read: async (p: string) => {
        if (!files.has(p)) throw new Error(`ENOENT: ${p}`)
        return files.get(p)
      },
      write: async (p: string, text: string) => { writes.push(p); files.set(p, text) },
      exists: async (p: string) => files.has(p) || dirs.has(p),
      stat: async (p: string) => {
        const text = files.get(p)
        if (text === undefined) throw new Error(`ENOENT: ${p}`)
        return { kind: 'file', size: new TextEncoder().encode(text).length, mtimeMs: 0, isLink: false }
      },
      list: async (dir: string) => {
        const names = new Set<string>()
        for (const p of [...files.keys(), ...dirs]) {
          if (!p.startsWith(`${dir}/`)) continue
          const rest = p.slice(dir.length + 1)
          if (rest) names.add(rest.split('/')[0])
        }
        return [...names].map(entry => {
          const path = `${dir}/${entry}`
          const text = files.get(path)
          if (text !== undefined) return { name: entry, kind: 'file', size: new TextEncoder().encode(text).length, mtimeMs: 0, isLink: links.has(path) }
          return { name: entry, kind: 'dir', size: 0, mtimeMs: 0, isLink: false }
        })
      },
    },
    process: {
      run: async (argv: readonly string[]) => {
        const line = logLineOf(argv)
        if (line !== null) { logged.push(line); return { exitCode: 0, stdout: '', stderr: '' } }
        runs.push(argv.join(' '))
        const ok = (stdout = '') => ({ exitCode: 0, stdout, stderr: '' })
        const fail = (code = 1) => ({ exitCode: code, stdout: '', stderr: 'failed' })
        if (argv[0] === 'sh' && argv[1] === '-c' && String(argv[2]).startsWith('ps -o ppid=')) return ok('123 ttys001\n')
        if (argv[0] === 'sh' && argv[1] === '-c' && String(argv[2]).startsWith('command -v')) return fail()
        if (argv[0] === 'sh' && argv[1] === '-c' && String(argv[2]).startsWith('printf')) {
          files.set(argv[5], (files.get(argv[5]) ?? '') + argv[4] + '\n')
          writes.push(argv[5])
          return ok()
        }
        if (argv[0] === 'ps' && argv[1] === '-t') return ok(name ? `  501 hostcli --name ${name}\n` : '  501 hostcli\n')
        if (argv[0] === 'hostname') return ok(`${options.machine ?? 'mac-a'}.local\n`)
        if (argv[0] === 'shasum' || argv[0] === 'sha256sum') {
          if (argv[0] === 'shasum' && options.noShasum) throw new Error('shasum: not found')
          if (argv[0] === 'sha256sum' && options.noSha256sum) throw new Error('sha256sum: not found')
          const path = argv[argv.length - 1]
          return files.has(path) ? ok(`${sha256(files.get(path)!)}  ${path}\n`) : fail()
        }
        if (argv[0] === 'mkdir') { dirs.add(argv[2]); return ok() }
        if (argv[0] === 'mv') {
          if (!files.has(argv[2])) return fail()
          files.set(argv[3], files.get(argv[2])!)
          files.delete(argv[2])
          writes.push(argv[3])
          return ok()
        }
        if (argv[0] === 'rm') {
          for (const p of argv.slice(2)) files.delete(p)
          return ok()
        }
        if (argv[0] === 'git' && argv[1] === '-C') {
          const repo = options.repos?.[argv[2]]
          if (!repo) return fail(128)
          const verb = argv.slice(3).join(' ')
          if (verb === 'status --porcelain') return ok(repo.dirty ? ' M belt.md\n' : '')
          if (verb === 'rev-list @{u}..HEAD') return repo.noUpstream ? fail(128) : ok('abc1234\n'.repeat(repo.ahead ?? 0))
          if (verb === 'remote get-url origin') return repo.remote ? ok(`${repo.remote}\n`) : fail(2)
          if (verb === 'rev-parse --abbrev-ref HEAD') return ok(`${repo.branch ?? 'main'}\n`)
        }
        return fail()
      },
    },
  }
  return {
    dollar, files, dirs, links, sent, submits, logged, writes, runs, registered, home: options.home, config,
    address: options.address, name,
    store: `${config}/claude-orchestrator/store`,
    briefs: `${config}/claude-orchestrator/briefs`,
    messages: () => sent.map(m => parseMoveMessage(m.text)),
  }
}
type Machine = ReturnType<typeof machine>

// A registration is keyed by its event, and a tool call by its tool too: the file serves two.
function mounted(register: Function = registerMoving): Record<string, Function> {
  const handlers: Record<string, Function> = {}
  register((...args: [event: string, handler: Function] | [event: string, matcher: object, handler: Function]) => {
    const tool = args.length === 3 ? String((args[1] as any).tool ?? '') : ''
    handlers[tool ? `${args[0]}:${tool.replace('mcp__orchestrator__', '')}` : args[0]] = args[args.length - 1] as Function
    return { catch: () => undefined }
  })
  return handlers
}

const passOn = async (e: any) => ({ passed: e.text })
const envelope = (body: string, name: string, from: string) =>
  `<cross-session-message from="${from}" from-name="${name}" from-mode="prompting">\n${body}\n</cross-session-message>`

// A message delivered to a machine, through its receive chain as the host runs it.
async function receive(handlers: Record<string, Function>, fx: Machine, text: string, from: Machine | { name: string; address: string }, kind = 'peer') {
  const origin = { kind, plugin: 'orchestrator' }
  const peer = 'dollar' in from ? { name: from.name ?? 'unnamed', address: from.address } : from
  return handlers['session.receive'](fx.dollar, { origin, text: envelope(text, peer.name ?? 'unnamed', peer.address) }, passOn)
}

// Every message each machine has sent and the other has not yet received, delivered in order,
// until neither has anything left to say.
async function settle(a: Machine, ha: Record<string, Function>, b: Machine, hb: Record<string, Function>, cap = 5000) {
  const cursor = { a: 0, b: 0 }
  for (let i = 0; i < cap; i++) {
    if (cursor.a < a.sent.length) {
      const m = a.sent[cursor.a++]
      await receive(hb, b, m.text, a)
    } else if (cursor.b < b.sent.length) {
      const m = b.sent[cursor.b++]
      await receive(ha, a, m.text, b)
    } else return
  }
  throw new Error('the two machines never fell silent')
}

const BRIEF_NAME = 'belt.md'
const BRIEF_TEXT = `# belt\nThe work is in ${HOME_A}/dev/app and the notes in ${HOME_A}/.claude/claude-orchestrator/briefs/belt/notes.txt.\n`
const NOTES_TEXT = 'notes: éé ok\n' + 'x'.repeat(4000) + '\n'

// A sender that holds a briefs directory: the brief and its notes, a sub-directory and a link
// that must not travel, and two checkouts that are clean and pushed.
function sender(over: Partial<Options> = {}): Machine {
  const fx = machine({
    home: HOME_A, address: ADDRESS_A, name: 'Orch : belt',
    repos: {
      [`${HOME_A}/dev/app`]: { remote: 'git@example.com:acme/app.git', branch: 'feat/belt' },
      [`${HOME_A}/dev/lib`]: {},
    },
    ...over,
  })
  const dir = `${fx.briefs}/belt`
  fx.files.set(`${dir}/${BRIEF_NAME}`, BRIEF_TEXT)
  fx.files.set(`${dir}/notes.txt`, NOTES_TEXT)
  fx.files.set(`${dir}/linked.md`, 'a link')
  fx.links.add(`${dir}/linked.md`)
  fx.files.set(`${dir}/old/inner.md`, 'in a sub-directory')
  return fx
}

function receiver(over: Partial<Options> = {}): Machine {
  return machine({ home: HOME_B, address: ADDRESS_B, name: 'Orch : far', machine: 'mac-b', ...over })
}

function sendInput(fx: Machine, over: Record<string, unknown> = {}) {
  return {
    to: ADDRESS_B, name: 'Orch : belt', brief: `${fx.briefs}/belt/${BRIEF_NAME}`, dir: `${HOME_A}/dev/app`, model: 'a-model',
    effort: 'high', prs: ['acme/app#7 feat/belt'], checkouts: [`${HOME_A}/dev/app`, `${HOME_A}/dev/lib`],
    order: '2026-10-17T10:00Z: move belt to the other machine', ...over,
  }
}

const kinds = (fx: Machine) => fx.messages().map(m => m?.kind ?? 'unparsable')

// --- the tools ----------------------------------------------------------------------------

test('both tools are declared at every start, a session the launcher opened included', async () => {
  for (const spawned of [false, true]) {
    const h = mounted()
    const fx = sender({ spawned })
    const e = {}
    expect(await h['session.start'](fx.dollar, e, (x: unknown) => x)).toBe(e)
    expect(fx.registered.map((spec: any) => spec.name)).toEqual(['move_send', 'move_probe'])
    expect(fx.registered.every((spec: any) => spec.isDeferred === false)).toBe(true)
    const send = fx.registered.find((spec: any) => spec.name === 'move_send').inputSchema
    expect(Object.keys(send.properties)).toEqual(['to', 'name', 'brief', 'dir', 'model', 'effort', 'prs', 'checkouts', 'order', 'chunk'])
    expect(send.required).toEqual(['to', 'name', 'brief', 'dir', 'model', 'effort', 'prs', 'checkouts', 'order'])
    const probe = fx.registered.find((spec: any) => spec.name === 'move_probe').inputSchema
    expect(Object.keys(probe.properties)).toEqual(['to', 'sizes'])
    expect(probe.required).toEqual(['to', 'sizes'])
  }
})

test('the tools are refused from a subagent, and to a session named neither Orch nor Coord', async () => {
  const h = mounted()
  const fx = sender()
  for (const tool of ['move_send', 'move_probe']) {
    const input = tool === 'move_send' ? sendInput(fx) : { to: ADDRESS_B, sizes: [2048] }
    const refused = await h[`tool.call:${tool}`](fx.dollar, { ...input, agentId: 'a-1' })
    expect(refused.isError).toBe(true)
    expect(refused.result).toContain('main thread')
  }
  expect(fx.sent).toEqual([])
  for (const name of ['Agent : x', null, 'Audit : x']) {
    const other = sender({ name })
    for (const tool of ['move_send', 'move_probe']) {
      const input = tool === 'move_send' ? sendInput(other) : { to: ADDRESS_B, sizes: [2048] }
      const answer = await h[`tool.call:${tool}`](other.dollar, input)
      expect(answer.isError).toBe(true)
      expect(answer.result).toContain('Orch :')
    }
    expect(other.sent).toEqual([])
  }
  for (const name of ['Orch : x', 'Coord : x']) {
    const other = sender({ name })
    const sentOk = await h['tool.call:move_send'](other.dollar, sendInput(other, { name: 'Orch : belt' }))
    expect(sentOk.isError).toBeUndefined()
    const probed = await h['tool.call:move_probe'](other.dollar, { to: ADDRESS_B, sizes: [2048] })
    expect(probed.isError).toBeUndefined()
  }
})

// --- the send -----------------------------------------------------------------------------

test('move_send lists the regular files of the directory only, and hashes them with the process', async () => {
  const h = mounted()
  const fx = sender()
  // A process that answers a hash of its own: the manifest carries what the process said.
  const real = fx.dollar.process.run
  const said = 'f'.repeat(64)
  fx.dollar.process.run = async (argv: readonly string[]) => (argv[0] === 'shasum' ? { exitCode: 0, stdout: `${said}  ${argv[3]}\n`, stderr: '' } : real(argv))
  await h['tool.call:move_send'](fx.dollar, sendInput(fx))
  const manifest = fx.messages()[0] as Extract<MoveMessage, { kind: 'manifest' }>
  expect(manifest.kind).toBe('manifest')
  expect(manifest.files.map(f => f.name)).toEqual([BRIEF_NAME, 'notes.txt'])
  expect(manifest.files.every(f => f.sha256 === said)).toBe(true)
  expect(manifest.files[0].bytes).toBe(new TextEncoder().encode(BRIEF_TEXT).length)
  expect(manifest.files[1].chunks).toBe(chunkText(NOTES_TEXT, MOVE_CHUNK_DEFAULT).length)
  expect(manifest.origin).toEqual({ machine: 'mac-a', home: HOME_A, configDir: `${HOME_A}/.claude` })
})

test('without shasum the hash comes from sha256sum', async () => {
  const h = mounted()
  const fx = sender({ noShasum: true })
  await h['tool.call:move_send'](fx.dollar, sendInput(fx))
  const manifest = fx.messages()[0] as Extract<MoveMessage, { kind: 'manifest' }>
  expect(manifest.files[0].sha256).toBe(sha256(BRIEF_TEXT))
  expect(fx.runs.some(run => run.startsWith('sha256sum '))).toBe(true)
  const neither = sender({ noShasum: true, noSha256sum: true })
  const refused = await h['tool.call:move_send'](neither.dollar, sendInput(neither))
  expect(refused.isError).toBe(true)
  expect(neither.sent).toEqual([])
})

test('the messages go to the peer in order: the manifest, every chunk, then « sent »', async () => {
  const h = mounted()
  const fx = sender()
  const answer = await h['tool.call:move_send'](fx.dollar, sendInput(fx, { chunk: 1000 }))
  expect(answer.isError).toBeUndefined()
  expect(fx.sent.every(m => m.to === ADDRESS_B)).toBe(true)
  const messages = fx.messages() as MoveMessage[]
  const manifest = messages[0] as Extract<MoveMessage, { kind: 'manifest' }>
  const expected = ['manifest']
  manifest.files.forEach((f, file) => { for (let index = 0; index < f.chunks; index++) expected.push(`chunk ${file}:${index}`) })
  expected.push('sent')
  expect(messages.map(m => (m.kind === 'chunk' ? `chunk ${m.file}:${m.index}` : m.kind))).toEqual(expected)
  // The chunks rejoin to the files as they are.
  const joined = [BRIEF_TEXT, NOTES_TEXT].map((_, file) =>
    messages.filter((m): m is Extract<MoveMessage, { kind: 'chunk' }> => m.kind === 'chunk' && m.file === file).map(m => m.data).join(''))
  expect(joined).toEqual([BRIEF_TEXT, NOTES_TEXT])
  expect(manifest.record).toEqual({
    name: 'Orch : belt', brief: `${fx.briefs}/belt/${BRIEF_NAME}`, dir: `${HOME_A}/dev/app`, model: 'a-model', effort: 'high',
    prs: ['acme/app#7 feat/belt'], checkouts: [`${HOME_A}/dev/app`, `${HOME_A}/dev/lib`],
    git: { url: 'git@example.com:acme/app.git', branch: 'feat/belt' }, order: '2026-10-17T10:00Z: move belt to the other machine',
  })
  expect(manifest.move).toBe(moveIdOf(manifest.record, manifest.files))
})

test('the store keeps the move and the answer carries its id and its counts', async () => {
  const h = mounted()
  const fx = sender()
  const answer = await h['tool.call:move_send'](fx.dollar, sendInput(fx, { chunk: 1000 }))
  const manifest = fx.messages()[0] as Extract<MoveMessage, { kind: 'manifest' }>
  const kept = JSON.parse(fx.files.get(`${fx.store}/moves/${manifest.move}.json`)!)
  expect(kept.to).toBe(ADDRESS_B)
  expect(kept.record).toEqual(manifest.record)
  expect(kept.files).toEqual(manifest.files)
  expect(kept.rounds).toBe(0)
  const chunks = manifest.files.reduce((sum, f) => sum + f.chunks, 0)
  const bytes = manifest.files.reduce((sum, f) => sum + f.bytes, 0)
  expect(answer.result).toContain(manifest.move)
  expect(answer.result).toContain(`${manifest.files.length} files`)
  expect(answer.result).toContain(`${chunks} chunks`)
  expect(answer.result).toContain(`${bytes} bytes`)
})

test('a directory that is no checkout gives a record with no git', async () => {
  const h = mounted()
  const fx = sender()
  await h['tool.call:move_send'](fx.dollar, sendInput(fx, { dir: `${HOME_A}/dev/plain` }))
  expect((fx.messages()[0] as any).record.git).toBeNull()
})

test('a dirty or an unpushed checkout refuses the move before anything is sent', async () => {
  const h = mounted()
  const cases: [Repo, string][] = [
    [{ dirty: true }, 'uncommitted'], [{ ahead: 2 }, 'not pushed'], [{ noUpstream: true }, 'upstream'],
  ]
  for (const [repo, word] of cases) {
    const fx = sender({ repos: { [`${HOME_A}/dev/app`]: { remote: 'git@example.com:acme/app.git' }, [`${HOME_A}/dev/lib`]: repo } })
    const answer = await h['tool.call:move_send'](fx.dollar, sendInput(fx))
    expect(answer.isError).toBe(true)
    expect(answer.result).toContain(`${HOME_A}/dev/lib`)
    expect(answer.result).toContain(word)
    expect(fx.sent).toEqual([])
    expect([...fx.files.keys()].some(p => p.includes('/moves/'))).toBe(false)
  }
  const missing = sender()
  const answer = await h['tool.call:move_send'](missing.dollar, sendInput(missing, { checkouts: [`${HOME_A}/dev/nowhere`] }))
  expect(answer.isError).toBe(true)
  expect(missing.sent).toEqual([])
})

test('a file over a cap, or too many files, refuses the move before anything is sent', async () => {
  const h = mounted()
  const big = sender()
  big.files.set(`${big.briefs}/belt/big.bin`, 'x'.repeat(4 * 1024 * 1024 + 1))
  const tooBig = await h['tool.call:move_send'](big.dollar, sendInput(big))
  expect(tooBig.isError).toBe(true)
  expect(tooBig.result).toContain('big.bin')
  expect(big.sent).toEqual([])
  const many = sender()
  for (let i = 0; i < 520; i++) many.files.set(`${many.briefs}/belt/f${i}.md`, 'x')
  const tooMany = await h['tool.call:move_send'](many.dollar, sendInput(many))
  expect(tooMany.isError).toBe(true)
  expect(tooMany.result).toContain('files')
  expect(many.sent).toEqual([])
  const odd = sender()
  odd.files.set(`${odd.briefs}/belt/two words.md`, 'x')
  const badName = await h['tool.call:move_send'](odd.dollar, sendInput(odd))
  expect(badName.isError).toBe(true)
  expect(odd.sent).toEqual([])
})

test('a brief that is not among the files, an empty directory and a bad field are refused whole', async () => {
  const h = mounted()
  const fx = sender()
  const cases: Record<string, unknown>[] = [
    { brief: `${fx.briefs}/belt/missing.md` }, { brief: `${fx.briefs}/empty/x.md` }, { brief: 'belt.md' },
    { name: 'Agent : belt' }, { model: '' }, { effort: 'fast' }, { order: '' }, { prs: 'acme/app#7' }, { checkouts: ['relative'] },
    { chunk: 0 }, { chunk: 1.5 }, { to: '' },
  ]
  for (const over of cases) {
    const answer = await h['tool.call:move_send'](fx.dollar, sendInput(fx, over))
    expect(answer.isError).toBe(true)
  }
  expect(fx.sent).toEqual([])
})

test('a send the peer cannot be reached for is an error, and the move is kept to be sent again', async () => {
  const h = mounted()
  const fx = sender({ unreachable: [ADDRESS_B] })
  const answer = await h['tool.call:move_send'](fx.dollar, sendInput(fx))
  expect(answer.isError).toBe(true)
  expect(answer.result).toContain('no such session')
  expect(fx.sent).toEqual([])
  expect([...fx.files.keys()].some(p => p.startsWith(`${fx.store}/moves/`) && p.endsWith('.json'))).toBe(true)
})

// --- the probes ---------------------------------------------------------------------------

test('move_probe sends one probe per size, each carrying that many data characters', async () => {
  const h = mounted()
  const fx = sender()
  const answer = await h['tool.call:move_probe'](fx.dollar, { to: ADDRESS_B, sizes: [2048, 8192, 32768] })
  expect(answer.isError).toBeUndefined()
  const probes = fx.messages() as Extract<MoveMessage, { kind: 'probe' }>[]
  expect(probes.map(p => [p.kind, p.size, p.data.length])).toEqual([['probe', 2048, 2048], ['probe', 8192, 8192], ['probe', 32768, 32768]])
  expect(fx.sent.every(m => m.to === ADDRESS_B)).toBe(true)
  for (const bad of [{ sizes: [] }, { sizes: [0] }, { sizes: [1.5] }, { sizes: ['9'] }, { sizes: 'x' }, { sizes: [2_000_000] }, { to: '' }]) {
    const refused = await h['tool.call:move_probe'](fx.dollar, { to: ADDRESS_B, sizes: [2048], ...bad })
    expect(refused.isError).toBe(true)
  }
  expect(fx.sent.length).toBe(3)
})

// --- the receiver -------------------------------------------------------------------------

const TARGET_B = { home: HOME_B, configDir: `${HOME_B}/.claude` }
const BRIEF_ARRIVED = BRIEF_TEXT.split(HOME_A).join(HOME_B)

// What a sender sends for the fixture directory, captured: the messages in the order sent.
async function sentMessages(chunk = 1000): Promise<{ a: Machine; ha: Record<string, Function>; messages: MoveMessage[]; manifest: Extract<MoveMessage, { kind: 'manifest' }> }> {
  const ha = mounted()
  const a = sender()
  const answer = await ha['tool.call:move_send'](a.dollar, sendInput(a, { chunk }))
  expect(answer.isError).toBeUndefined()
  const messages = a.messages() as MoveMessage[]
  return { a, ha, messages, manifest: messages[0] as Extract<MoveMessage, { kind: 'manifest' }> }
}

const textOf = (message: MoveMessage) => moveText(message)

async function deliverAll(hb: Record<string, Function>, b: Machine, a: Machine, messages: MoveMessage[]) {
  const results = []
  for (const m of messages) results.push(await receive(hb, b, textOf(m), a))
  return results
}

const acksOf = (b: Machine) => b.messages().filter((m): m is Extract<MoveMessage, { kind: 'ack' }> => m?.kind === 'ack')
const briefsWritten = (b: Machine) => [...b.files.keys()].filter(p => p.startsWith(`${b.briefs}/`))

test('a marked delivery is consumed: no model reads it, and the files land rewritten in the briefs directory', async () => {
  const { a, messages, manifest } = await sentMessages()
  const hb = mounted()
  const b = receiver()
  const results = await deliverAll(hb, b, a, messages)
  expect(results.every(r => typeof r.consumed === 'string')).toBe(true)
  const arrival = arrivalOf(manifest, TARGET_B) as any
  expect(arrival.briefDir).toBe(`${b.briefs}/belt`)
  expect(b.files.get(arrival.brief)).toBe(BRIEF_ARRIVED)
  expect(b.files.get(`${arrival.briefDir}/notes.txt`)).toBe(NOTES_TEXT)
  expect(b.dirs.has(arrival.briefDir)).toBe(true)
  expect(acksOf(b).map(m => [m.file, m.ok, m.reason])).toEqual([[0, true, null], [1, true, null]])
  expect(b.sent.every(m => m.to === ADDRESS_A)).toBe(true)
})

test('chunks that arrive out of order are joined right', async () => {
  const { a, messages } = await sentMessages(500)
  const hb = mounted()
  const b = receiver()
  const [manifest, ...rest] = messages
  const chunks = rest.filter(m => m.kind === 'chunk').reverse()
  await deliverAll(hb, b, a, [manifest, ...chunks, ...rest.filter(m => m.kind === 'sent')])
  expect(b.files.get(`${b.briefs}/belt/notes.txt`)).toBe(NOTES_TEXT)
  expect(b.files.get(`${b.briefs}/belt/${BRIEF_NAME}`)).toBe(BRIEF_ARRIVED)
})

test('a sha256 mismatch acks not ok and writes nothing in the briefs directory', async () => {
  const { a, messages } = await sentMessages(500)
  const hb = mounted()
  const b = receiver()
  let flipped = false
  const tampered = messages.map(m => {
    if (m.kind !== 'chunk' || m.file !== 1 || flipped) return m
    flipped = true
    return { ...m, data: m.data.replace('x', 'y').replace('n', 'm') }
  })
  await deliverAll(hb, b, a, tampered)
  const acks = acksOf(b)
  expect(acks.find(m => m.file === 1)).toMatchObject({ ok: false })
  expect(acks.find(m => m.file === 1)!.reason).toContain('notes.txt')
  expect(briefsWritten(b).some(p => p.endsWith('/notes.txt'))).toBe(false)
  // The other file is unharmed, and the move is over, not ok.
  expect(b.files.get(`${b.briefs}/belt/${BRIEF_NAME}`)).toBe(BRIEF_ARRIVED)
  const done = b.messages().find(m => m?.kind === 'done') as any
  expect(done).toMatchObject({ ok: false, brief: null })
  expect(b.submits).toEqual([])
})

test('a target that exists with the same content is acked ok, with other content refused', async () => {
  const { a, messages } = await sentMessages()
  const hb = mounted()
  const b = receiver()
  b.files.set(`${b.briefs}/belt/${BRIEF_NAME}`, BRIEF_ARRIVED)
  b.files.set(`${b.briefs}/belt/notes.txt`, 'other content, kept\n')
  await deliverAll(hb, b, a, messages)
  const acks = acksOf(b)
  expect(acks.find(m => m.file === 0)).toMatchObject({ ok: true })
  expect(acks.find(m => m.file === 1)).toMatchObject({ ok: false })
  expect(acks.find(m => m.file === 1)!.reason).toContain('notes.txt')
  expect(b.files.get(`${b.briefs}/belt/notes.txt`)).toBe('other content, kept\n')
  expect(b.writes.filter(p => p === `${b.briefs}/belt/${BRIEF_NAME}`)).toEqual([])
})

test('the same move sent twice is kept as it is: acknowledged again, nothing written twice', async () => {
  const { a, ha, messages, manifest } = await sentMessages()
  // The same arguments give the same move.
  const again = sender()
  const hs = mounted()
  await hs['tool.call:move_send'](again.dollar, sendInput(again, { chunk: 1000 }))
  expect((again.messages()[0] as any).move).toBe(manifest.move)
  const hb = mounted()
  const b = receiver()
  await deliverAll(hb, b, a, messages)
  const writes = [...b.writes]
  const acks = acksOf(b).length
  await deliverAll(hb, b, a, messages)
  expect(b.writes).toEqual(writes)
  expect(acksOf(b).length).toBeGreaterThan(acks)
  expect(b.messages().filter(m => m?.kind === 'done').length).toBeGreaterThanOrEqual(1)
  expect(b.submits.length).toBe(1)
  void ha
})

test('all files acknowledged: done ok carries the brief, and the receiver\'s model reads the arrival notice once', async () => {
  const { a, messages, manifest } = await sentMessages()
  const hb = mounted()
  const b = receiver()
  await deliverAll(hb, b, a, messages)
  const arrival = arrivalOf(manifest, TARGET_B) as any
  const done = b.messages().filter(m => m?.kind === 'done') as any[]
  expect(done[0]).toEqual({ kind: 'done', move: manifest.move, ok: true, brief: arrival.brief, reason: null })
  expect(b.submits).toEqual([{ text: arrivedNotice(manifest, arrival, 'Orch : belt', LAUNCHER) }])
  // The arrival the notice reports is the one written.
  expect(b.submits[0].text).toContain(arrival.brief)
})

test('a manifest the receiver refuses is answered done not ok, and nothing is written', async () => {
  const { a, manifest } = await sentMessages()
  const hb = mounted()
  const b = receiver()
  const forged = { ...manifest, record: { ...manifest.record, order: 'another order' } }
  await receive(hb, b, textOf(forged), a)
  const done = b.messages()[0] as any
  expect(done).toMatchObject({ kind: 'done', move: manifest.move, ok: false, brief: null })
  expect(done.reason).toContain('move id')
  expect(b.writes).toEqual([])
  expect(b.submits).toEqual([])
})

test('a probe is answered with the length received', async () => {
  const hb = mounted()
  const b = receiver()
  const a = sender()
  const probe = { kind: 'probe', move: 'probe-0123456789ab', size: 3000, data: 'z'.repeat(3000) } as const
  const r = await receive(hb, b, textOf(probe), a)
  expect(typeof r.consumed).toBe('string')
  expect(b.messages()).toEqual([{ kind: 'probe-ack', move: probe.move, size: 3000, received: 3000 }])
  expect(b.sent[0].to).toBe(ADDRESS_A)
})

test('a marked message that is not the module\'s to act on is consumed and does nothing', async () => {
  const { a, messages, manifest } = await sentMessages()
  const hb = mounted()
  const b = receiver()
  const stranger = { name: 'Orch : intruder', address: 'bridge:session_03Stranger' }
  const chunk = messages.find(m => m.kind === 'chunk')!
  await receive(hb, b, textOf(manifest), a)
  const before = { writes: [...b.writes], sent: b.sent.length, submits: b.submits.length }
  const cases: [string, Machine | typeof stranger, Machine?][] = [
    ['a chunk from another session', stranger],
    ['a sent from another session', stranger],
    ['a chunk of a move it does not know', a],
    ['text that does not parse', a],
    ['a kind with an extra field', a],
  ]
  const texts = [
    textOf(chunk), textOf({ kind: 'sent', move: manifest.move }),
    textOf({ ...(chunk as any), move: 'other-0123456789ab' }),
    '[module-move] {"kind":', textOf({ ...(chunk as any), extra: 1 } as any),
  ]
  for (const [i, [, from]] of cases.entries()) {
    const r = await receive(hb, b, texts[i], from as any)
    expect(typeof r.consumed).toBe('string')
    expect(r.passed).toBeUndefined()
  }
  expect({ writes: b.writes, sent: b.sent.length, submits: b.submits.length }).toEqual({ writes: before.writes, sent: before.sent, submits: before.submits })
  expect(b.logged.length).toBeGreaterThanOrEqual(cases.length)
})

test('a session named neither Orch nor Coord consumes a marked message and does nothing with it', async () => {
  const { a, messages } = await sentMessages()
  const hb = mounted()
  const b = receiver({ name: 'Agent : x' })
  for (const m of messages) {
    const r = await receive(hb, b, textOf(m), a)
    expect(typeof r.consumed).toBe('string')
  }
  const probe = await receive(hb, b, textOf({ kind: 'probe', move: 'probe-0123456789ab', size: 5, data: 'zzzzz' }), a)
  expect(typeof probe.consumed).toBe('string')
  expect(b.writes).toEqual([])
  expect(b.sent).toEqual([])
  expect(b.submits).toEqual([])
})

test('an unmarked delivery, a person\'s prompt and a subagent\'s receive pass through untouched', async () => {
  const hb = mounted()
  const b = receiver()
  const a = sender()
  expect(await receive(hb, b, 'hello there', a)).toEqual({ passed: envelope('hello there', 'Orch : belt', ADDRESS_A) })
  const marked = textOf({ kind: 'sent', move: 'belt-0123456789ab' })
  const typed = await hb['session.receive'](b.dollar, { origin: { kind: 'user' }, text: marked }, passOn)
  expect(typed).toEqual({ passed: marked })
  const sub = await hb['session.receive'](b.dollar, { agentId: 'a-1', origin: { kind: 'peer' }, text: envelope(marked, 'Orch : belt', ADDRESS_A) }, passOn)
  expect(sub.passed).toBeDefined()
  expect(b.sent).toEqual([])
})
