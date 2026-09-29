---
# Grades COORD-053: the successor's brief orders the predecessor's tab closed before the
# successor registers (a close of the predecessor's tty, then a register, in that order)
type: regex
target: {source: file, path: briefs/coord-succession.md}
---

close\b[^\n]*ttys003[\s\S]*\bregister\b
