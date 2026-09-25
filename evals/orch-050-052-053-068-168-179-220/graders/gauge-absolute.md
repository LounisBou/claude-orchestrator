---
type: llm
focus: {source: file, path: briefs/phase-5.md}
---

Grades ORCH-179 (the same context-gauge invocation the orchestrator uses is put in every
agent prompt; the agent reports its measured context) and ORCH-220 (a path in a brief never
depends on a host-expanded variable: the session opening it has a plain shell).

Pass only if ALL hold for the brief:

1. It tells the agent to measure and report its context with the context-gauge script,
   pasting the measured figure (not an estimate) in its reports.
2. The script is named by an absolute path under
   `/Users/dev/.claude/plugins/cache/lounisbou/orchestrator/0.34.0/`.
3. No path in the brief uses a variable the host expands (`${CLAUDE_PLUGIN_ROOT}`,
   `$CLAUDE_...`, or any `${...}` placeholder left for the agent's shell).
