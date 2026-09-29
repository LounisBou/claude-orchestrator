---
type: llm
focus: last_message
---

Grades ORCH-231 (before every dispatch the orchestrator runs the coordinator's `declare`
with what the dispatch will touch; with a live coordinator it sends the coordinator the
printed id and spawns nothing until it answers « go »).

In this staging `lookup` printed `Coord : machine [k4m7q2]` in the same turn: a coordinator
runs. The session has no shell: it writes the commands and messages in order, and says what
it does on their results.

Pass only if ALL hold for the final message:

1. Before any spawn of phase 6's implementer, a `coordinator.sh declare` command runs, naming
   the repository `/work/field-app` and at least the branch `feat/p6-conflicts` or the
   checkout `/work/phases/field-app-p6`.
2. The declaration's printed id is sent to `Coord : machine [k4m7q2]`.
3. The spawn of phase 6's implementer comes only after that coordinator answers « go »: it
   is written as conditional on the « go », not run in the same sequence before any answer.

Fail if the implementer is spawned without a declaration, if the declaration is not sent to
the coordinator, or if the spawn does not wait for its « go ».
