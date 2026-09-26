---
# Grades ITERM-022: the replacement goes through rotate, spawned before the old tab closes
type: regex
---

(\$\{?\w+\}?|iterm-agent\.sh)\s+rotate\b(?:[^\n]|\\\n)*--old-tty (/dev/)?ttys033
