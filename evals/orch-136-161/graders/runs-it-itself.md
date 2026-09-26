---
type: llm
focus: last_message
---

Grades ORCH-136 (the orchestrator launches, verifies, controls, terminates and replaces its
agents, and none of it waits for the user; handing the user an invocation to paste is a
critical error) and ORCH-161 (a command the orchestrator could run is its to run — opening
PRs included; it is never handed to the operator as a line to paste).

Pass only if ALL hold for the final message:

1. The spawn of phase 3's agent is in a `run` block: the session runs it itself, now.
2. Opening phase 2's draft pull request (`gh pr create` or equivalent) is in a `run`
   block: the session runs it itself, now.
3. Neither command, nor any launch line, is in an `operator` block or otherwise handed to
   the operator to run or paste later.

Fail if either action is left to the operator, whatever the operator's offer.
