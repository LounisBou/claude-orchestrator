// tests/deck-e2e.ts - the deck built once from this machine's real state, read-only.
//
//   node tests/deck-e2e.ts [--hooks <dir>] [--keep]
//
// NOT part of `run-tests.sh`: it reads the operator's real store, transcripts and prices,
// which a suite must never depend on. It runs the supervision's writeDeck (from `--hooks`,
// this checkout's hooks by default) over a $ spelled on node: every read reaches the real
// files, every write lands in memory, the deck's rename lands in a temporary file, and no
// removal runs. It prints how long one write took cold and once warm, then checks every
// usage field's type and that the totals are the sum of the local sessions' usage.
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const hooks = resolve(args.includes('--hooks') ? args[args.indexOf('--hooks') + 1] : join(import.meta.dirname, '..', 'hooks'))
const keep = args.includes('--keep')
const out = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'deck-e2e-'))
const deckPath = join(out, 'deck.json')

const memory = new Map<string, string>()
const run = (argv: readonly string[], options?: { timeoutMs?: number }) => new Promise<{ exitCode: number; stdout: string; stderr: string }>(done => {
  if (argv[0] === 'rm' || argv.some(a => a.endsWith('log-append.sh'))) return done({ exitCode: 0, stdout: '', stderr: '' })
  if (argv[0] === 'mv') {
    const text = memory.get(argv[2])
    if (text === undefined) return done({ exitCode: 1, stdout: '', stderr: 'nothing to move' })
    memory.delete(argv[2])
    if (argv[3].endsWith('/deck.json')) writeFileSync(deckPath, text)
    else memory.set(argv[3], text)
    return done({ exitCode: 0, stdout: '', stderr: '' })
  }
  execFile(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 1 << 30, timeout: options?.timeoutMs ?? 0 }, (err: any, stdout, stderr) => {
    done({ exitCode: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })
  })
})

const $ = {
  session: { id: async () => 'deck-e2e', send: async () => ({ isDelivered: false, reason: 'read-only run' }) },
  env: { get: async (name: string) => process.env[name] },
  plugin: { name: 'orchestrator', root: resolve(hooks, '..') },
  fs: {
    read: async (p: string) => (memory.has(p) ? memory.get(p)! : readFileSync(p, 'utf8')),
    write: async (p: string, text: string) => { memory.set(p, text) },
    exists: async (p: string) => memory.has(p) || existsSync(p),
    list: async (dir: string) => readdirSync(dir, { withFileTypes: true }).map(e => ({
      name: e.name, kind: e.isDirectory() ? 'dir' : 'file', mtimeMs: statSync(join(dir, e.name), { throwIfNoEntry: false })?.mtimeMs ?? 0,
    })),
    stat: async (p: string, options?: { resolve?: boolean }) => {
      const stat = statSync(p)
      return { size: stat.size, mtimeMs: stat.mtimeMs, ...(options?.resolve ? { realPath: realpathSync(p) } : {}) }
    },
  },
  process: { run },
}

const { writeDeck } = await import(join(hooks, 'supervision.ts'))
const timed = async () => {
  const start = performance.now()
  await writeDeck($)
  return Math.round(performance.now() - start)
}
const cold = await timed()
const warm = await timed()
process.stdout.write(`deck write: ${cold} ms cold, ${warm} ms warm (${hooks})\n`)

let failures = 0
const check = (name: string, ok: boolean) => {
  process.stdout.write(`  ${ok ? 'ok  ' : 'FAIL'} ${name}\n`)
  if (!ok) failures++
}
const deck = JSON.parse(readFileSync(deckPath, 'utf8'))
const iso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString() === v
const count = (v: unknown) => Number.isInteger(v) && (v as number) >= 0
const period = (p: any) => p && iso(p.from) && ['input', 'output', 'cache_read', 'cache_write'].every(k => count(p.tokens?.[k]))
  && Object.keys(p.tokens).length === 4 && (p.cost_usd === null || (typeof p.cost_usd === 'number' && p.cost_usd >= 0))
const usage = (u: any) => u && period(u.day) && period(u.week) && iso(u.at)

if (deck.version === 2) {
  const sessions = [
    ...(deck.coordinator ? [deck.coordinator] : []),
    ...deck.orchestrators.flatMap((o: any) => [o, ...o.agents]),
    ...deck.unattached_agents,
  ]
  const local = sessions.filter((s: any) => !s.machine)
  check(`${sessions.length} sessions, each usage null or well typed`, sessions.every((s: any) => s.usage === null || usage(s.usage)))
  check('a remote session carries null', sessions.filter((s: any) => s.machine).every((s: any) => s.usage === null))
  check(`${local.filter((s: any) => s.usage).length} local sessions read from their transcripts`, local.some((s: any) => s.usage))
  check('the totals are well typed', usage(deck.usage_totals))
  check('the basis is the contract\'s', JSON.stringify(deck.usage_basis) === '{"currency":"USD","prices":"api-list-equivalent","timezone":"Europe/Paris"}')
  for (const name of ['day', 'week'] as const) {
    const read = local.filter((s: any) => s.usage).map((s: any) => s.usage[name])
    const total = deck.usage_totals[name]
    check(`the ${name}'s tokens are the sessions' sum`, ['input', 'output', 'cache_read', 'cache_write'].every(k => total.tokens[k] === read.reduce((a: number, p: any) => a + p.tokens[k], 0)))
    const cost = read.some((p: any) => p.cost_usd === null) ? null : read.reduce((a: number, p: any) => a + p.cost_usd, 0)
    check(`the ${name}'s cost is the sessions' sum (${total.cost_usd === null ? 'null' : total.cost_usd.toFixed(2)} USD)`,
      cost === null ? total.cost_usd === null : Math.abs(total.cost_usd - cost) < 1e-9)
    check(`every ${name} starts where the totals' does`, read.length === 0 || read.every((p: any) => p.from === total.from))
  }
} else {
  process.stdout.write(`  deck version ${deck.version}: no usage to check\n`)
}

if (keep) process.stdout.write(`kept: ${deckPath}\n`)
else rmSync(out, { recursive: true, force: true })
process.exit(failures === 0 ? 0 : 1)
