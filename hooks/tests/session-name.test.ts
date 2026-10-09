// hooks/tests/session-name.test.ts
// The naming domain: the pure parsers from session-name.ts, and the walk from
// guards.ts (the engine fences $ to the file whose handlers hold it, so the
// walk lives there — the tests follow the domain, not the file).
import { expect, test } from 'claude-code/testing'
import { roleOf, titleOf } from '../session-name.ts'
import { lastCustomTitle } from '../guards.ts'

test('the role is the prefix of the name', () => {
  expect(roleOf('Orch : payments')).toBe('orchestrator')
  expect(roleOf('Agent : belt-p3')).toBe('agent')
  expect(roleOf('Audit : 1712')).toBe('auditor')
  expect(roleOf('Coord : main')).toBe('coordinator')
  expect(roleOf('a plain session')).toBeNull()
  expect(roleOf('')).toBeNull()
})

// The same three lines as tests/fixtures/transcript-renamed.jsonl, kept in step
// with it: the file serves the run that holds a real $, the string the run
// that holds none.
const FIXTURE_TEXT = [
  '{"type":"user","message":{"role":"user","content":"first turn"}}',
  '{"type":"custom-title","customTitle":"Agent : first-name"}',
  '{"type":"custom-title","customTitle":"Agent : renamed-later"}',
].join('\n') + '\n'

// The harness hands a test a $ of its own, reduced: the nouns it carries name
// the session's own surfaces, and neither fs nor process is among them. Where
// they are absent a fake serves the transcript through the same seam the
// module reads (stat for the size, dd for the window), the way the band test
// fakes its own $ whole. The fixture is plain ASCII, so chars count as bytes
// here.
function fakeDollar(text: string): any {
  return {
    fs: { stat: async () => ({ kind: 'file', size: text.length }) },
    process: {
      run: async (argv: readonly string[]) => {
        const flag = (name: string) => argv.find(a => a.startsWith(`${name}=`))?.split('=')[1]
        const bs = Number(flag('bs')), skip = Number(flag('skip')), count = Number(flag('count'))
        return { exitCode: 0, stdout: text.slice(skip * bs, (skip + count) * bs), stderr: '' }
      },
    },
  }
}

// The brief spells the fixture from the repo root; the plugin test runner
// stands in hooks/. The spelling that stats is the one read, wherever the
// runner's working directory is.
async function spelled(dollar: any, path: string): Promise<string> {
  for (const s of [path, `../${path}`]) {
    try {
      await dollar.fs.stat(s)
      return s
    } catch { /* not spelled from here */ }
  }
  return path
}

test('the last custom-title entry wins, read from the end', async ($: any) => {
  const path = 'tests/fixtures/transcript-renamed.jsonl'
  const dollar = ($ && $.fs && $.process) ? $ : fakeDollar(FIXTURE_TEXT)
  expect(await lastCustomTitle(dollar, await spelled(dollar, path))).toBe('Agent : renamed-later')
})

test('an entry cut by the block boundary is carried whole and still read', async () => {
  const BLOCK = 65536
  const entry = '{"type":"custom-title","customTitle":"Agent : straddles-the-cut"}'
  // One long line ends ten bytes short of the boundary, so the entry after it
  // crosses it: its head closes the last block's first line, its rest opens
  // the block before, and only the carried cut line joins the two halves.
  const text = 'a'.repeat(BLOCK - 10) + '\n' + entry + '\n'
  expect(await lastCustomTitle(fakeDollar(text), 'a-transcript.jsonl')).toBe('Agent : straddles-the-cut')
})

test('a transcript no rename was written to names nothing', async () => {
  const text = '{"type":"user","message":{"role":"user","content":"a turn"}}\n'
  expect(await lastCustomTitle(fakeDollar(text), 'a-transcript.jsonl')).toBeNull()
})

// unquoted()'s own rule (session_name.py:75-78): a rename the host stored with
// padding or surrounding quotes reads back trimmed, so its role prefix still
// matches; what trims to nothing names nothing. titleOf carries the rule; the
// walk returns it as the name.
test('a padded rename reads back trimmed, quotes stripped, empties to null', async () => {
  const entry = (title: string) => `{"type":"custom-title","customTitle":${JSON.stringify(title)}}`
  expect(titleOf(entry('  Agent : x  '))).toBe('Agent : x')
  expect(titleOf(entry('" Agent : quoted "'))).toBe('Agent : quoted')
  expect(titleOf(entry('  ""  '))).toBeNull()
  expect(titleOf('{"type":"user","message":{"role":"user","content":"no title"}}')).toBeNull()
  expect(await lastCustomTitle(fakeDollar(entry('  Agent : x  ') + '\n'), 'a-transcript.jsonl')).toBe('Agent : x')
})

// title_in answers its FIRST match from the end unconditionally, and unquoted
// maps both a value the host did not store as a string and one that trims to
// nothing to None — terminal: the LAST rename decides even when it names
// nothing, and the walk must not resurrect the name before it. An operator who
// de-roles an agent by renaming it away would keep being addressed as an agent
// past the gate otherwise.
test('a last rename that names nothing unnames the session, the rename before it notwithstanding', async () => {
  const entry = (title: string) => `{"type":"custom-title","customTitle":${JSON.stringify(title)}}`
  const earlier = entry('Agent : earlier') + '\n'
  const walk = (text: string) => lastCustomTitle(fakeDollar(text), 'a-transcript.jsonl')
  expect(await walk(earlier + entry('   ') + '\n')).toBeNull()
  expect(await walk(earlier + entry('  "  ') + '\n')).toBeNull()
  expect(await walk(earlier + '{"type":"custom-title","customTitle":42}\n')).toBeNull()
})
