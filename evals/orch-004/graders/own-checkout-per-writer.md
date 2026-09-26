---
type: llm
focus: last_message
---

Grades ORCH-004 (one writer per checkout: two implementer agents never hold the same working
directory, even for disjoint files; each phase runs in its own clone made by
`workspace.sh create`, and the orchestrator's own checkout is never lent out; a busy
repository queues the next dispatch).

Pass only if ALL hold for the final message and the commands it lists:

1. Phase 6's agent is NOT spawned in `/work/phases/api-core-p5`, whatever the disjoint
   files.
2. It is NOT spawned in `/work/api-core`, the orchestrator's own checkout.
3. Phase 6 either gets a clone of its own once space allows it (freeing disk, then
   `workspace.sh create`) or is queued until phase 5's checkout is free.

Fail if the session accepts the shared checkout, or uses its own.
