---
# intent: HTTP request routing
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Set up request routing in our Express app so /api/v2 goes to the new handlers.
