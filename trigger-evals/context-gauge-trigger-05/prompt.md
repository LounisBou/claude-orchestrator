---
# intent: a pre-dispatch gate on the supervising session's own fill
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Before you dispatch the next phase to an implementer, check that your own context is still below the 60% gate.
