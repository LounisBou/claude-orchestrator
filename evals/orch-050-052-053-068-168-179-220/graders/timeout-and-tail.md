---
# Grades ORCH-068: the long suite is wrapped in a timeout and read through tail in the same call
# (either a command line `timeout <n> ... | tail` that is not backgrounded — no trailing '&',
# no nohup — or the templates' own clause « wrapped in a timeout and piped to `tail` »)
type: regex
flags: im
target: {source: file, path: briefs/phase-5.md}
---

^(?![^\n]*(?<![&>|])&[ \t]*`?[ \t]*$)(?![^\n]*\bnohup\b)[^\n]*?\bg?timeout[ \t]+(?:-\S+[ \t]+)*\d+[smh]?\b[^\n]*?\|[ \t]*tail\b|wrapped (?:in|with) (?:an? )?(?:explicit )?timeout\b[^\n]*?\btail\b
