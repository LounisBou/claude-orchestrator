---
type: llm
focus: last_message
---

Grades ORCH-167 (pre-dispatch gate: never assign a new phase to an agent past ~60 %; rotate
first) and ORCH-158 (at the dispatch gate the orchestrator reads the context and the budget
— `five_hour_percent`, `seven_day_percent` — and chooses the tier by the model-routing
skill; no wave is dispatched without reading the tier map).

Pass only if ALL hold for the commands and the final message:

1. Phase 7 is not given to the agent at 63 %: it goes to a fresh session.
2. Before the dispatch, the session reads the budget figures (`five_hour_percent` and
   `seven_day_percent`, from the context gauge).
3. Before the dispatch, it reads the tier map (`resolve-tier` or the map) and names the
   tier phase 7 runs at.

Fail if phase 7 goes to the agent at 63 %, or is dispatched without the budget and tier
readings.
