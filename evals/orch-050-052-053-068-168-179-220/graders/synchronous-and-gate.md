---
type: llm
focus: {source: file, path: briefs/phase-5.md}
---

Grades ORCH-068 (every command runs synchronously in the tool call that waits for it; an
agent never ends its turn waiting for a run; long suites are wrapped in an explicit timeout
and piped to `tail` in the same call) and ORCH-168 (mid-work gate: an agent crossing ~60 %
context finishes the in-progress unit, then stops).

Pass only if ALL hold for the brief:

1. It requires commands to run synchronously in the call that waits for them, and forbids
   ending a turn waiting for a run (or backgrounding the suite).
2. It requires the long test suite to be wrapped in an explicit timeout and piped to `tail`
   in the same call.
3. It states the context gate: past about 60 % context, finish the unit in progress, then
   stop (and say so).
