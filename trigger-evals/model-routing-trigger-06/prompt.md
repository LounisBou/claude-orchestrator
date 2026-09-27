---
# intent: the cheapest model that closes a corrective in one round
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Choose the cheapest model that will still get this corrective follow-up done in a single round, before I dispatch it.
