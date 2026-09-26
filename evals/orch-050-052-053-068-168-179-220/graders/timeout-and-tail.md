---
# Grades ORCH-068: the long suite is wrapped in a timeout and read through tail in the same call
type: regex
target: {source: file, path: briefs/phase-5.md}
---

timeout \d+[^\n]*\btail\b
