---
# Grades ORCH-068: the brief never has the suite started in the background
type: regex
flags: m
match: not_contains
target: {source: file, path: briefs/phase-5.md}
---

\)\s*&\s*(`|$)
