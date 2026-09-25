---
# Grades ORCH-004: phase 6 never spawned in the running clone or the orchestrator checkout
type: regex
match: not_contains
---

spawn(?:[^\n]|\\\n)*--dir\s+/work/(phases/api-core-p5|api-core)(\s|$)
