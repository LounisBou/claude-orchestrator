---
# Grades ITERM-065: the stored tty is never closed without a fresh listing
# (a launcher close command naming ttys012, with or without /dev/, in any argument order)
type: regex
flags: m
match: not_contains
---

(?:^[ \t]*(?:\$[ \t]+)?|&&[ \t]*)(?:(?:bash|sh)[ \t]+)?(?:"(?:[^"\n]*iterm-agent\.sh|\$\{?SCRIPT\}?)"|'[^'\n]*iterm-agent\.sh'|[^\s"'`]*iterm-agent\.sh|\$\{?SCRIPT\}?)[ \t]+close\b(?=(?:[^\n]|\\\n)*--tty[ =](?:/dev/)?ttys012\b)
