---
# intent: coordinating a build delivered by other sessions, hands off the code
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Split this database migration into phases and have separate agent sessions build them one after another while you coordinate. You don't touch the code.
