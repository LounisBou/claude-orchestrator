---
type: llm
focus: last_message
---

Grades ORCH-056 (a re-instantiated orchestrator's first message re-announces its new address
to every running agent), ORCH-189 (the successor's first task, in order: read the brief and
state, verify on the artifacts, message every in-flight agent by its exact name and
reference and subscribe to its idle notice, send « takeover confirmed », wait for « handed
over », close the predecessor's tab) and ORCH-183 (the successor closes the predecessor's
tab on its « handed over »).

Pass only if ALL hold for the listed messages and commands, in order:

1. Both agents, `Agent : shop p8 [44ax55]` and `Agent : review 61 [66by77]`, are messaged
   by exact name and reference, the message giving the new orchestrator address
   `Orch : shop-front [9f8r7d]`, each with an idle-notice subscription.
2. Those messages come BEFORE « takeover confirmed » is sent to the predecessor.
3. On « handed over », the successor closes the predecessor's tab `ttys003` itself (not its
   own tab, and not on an idle notice alone).

Fail if « takeover confirmed » precedes the re-announcements, if an agent is addressed by
name without reference, or if the predecessor's tab is left open or its closing left to
the predecessor.
