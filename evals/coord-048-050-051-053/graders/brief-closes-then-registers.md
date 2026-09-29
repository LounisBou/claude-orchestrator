---
# Grades COORD-053: the successor's brief orders the predecessor's tab closed before the
# successor registers: a close of the predecessor's tty, then a register command, and no
# register command anywhere before that close (anchored at the start of the written files)
type: regex
target: files
---

^(?:(?!\bregister[ \t]+--)[\s\S])*?\bclose\b[^\n]*ttys003[\s\S]*\bregister[ \t]+--
