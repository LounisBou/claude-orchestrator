---
# Grades ITERM-054: --trust is never passed for the operator directory
type: regex
match: not_contains
---

spawn(?:[^\n]|\\\n)*(vendor-sdk(?:[^\n]|\\\n)*--trust|--trust(?:[^\n]|\\\n)*vendor-sdk)
