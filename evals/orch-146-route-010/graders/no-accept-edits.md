---
# Grades ROUTE-010: acceptEdits is not used for an agent that runs commands
type: regex
match: not_contains
---

spawn(?:[^\n]|\\\n)*--permission-mode acceptEdits
