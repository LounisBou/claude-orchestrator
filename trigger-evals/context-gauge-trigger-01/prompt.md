---
# intent: an orchestrator asks its implementer for its fill before the next unit
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Before I hand you the next unit of work: how full is your context window right now? I need a real figure, not a guess.
