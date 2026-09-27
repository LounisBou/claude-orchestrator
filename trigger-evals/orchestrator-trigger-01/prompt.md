---
# intent: a multi-phase plan run through separate implementer sessions
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

I have a five-phase plan in docs/plan.md. Don't write the code yourself: hand each phase to a separate implementer session, one stacked draft PR per phase, and check every delivery yourself.
