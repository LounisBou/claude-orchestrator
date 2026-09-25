---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `catalog` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, and say what you do next on its result.

Phase 4's agent reports, and nothing else has happened since you dispatched it:

« Phase 4 delivered. Branch `feat/p4-facets` pushed at 9c8d7e6. `npm test`: 212 passed,
0 failed. Coverage 91 %. I stopped the dev server I had started and deleted my scratch
directory `/tmp/p4-fixtures`. Nothing of mine is left running. Ready for your verdict. »

Decide phase 4's verdict, then write your final message.
