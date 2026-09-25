---
type: llm
focus: {source: file, path: briefs/review-88.md}
---

Grades TPL-REVIEW-004 (the review report ends with one machine line,
`norms-check: tool <head>` or `norms-check: none <head>`, naming the head read, and nothing
after it) and TPL-REVIEW-005 (no git configuration write of any kind in a pinned worktree,
which shares its source's `.git/config`: `-c` on the command line only).

Pass only if ALL hold for the brief:

1. It requires the report to end with the line `norms-check: tool 5e6f7a8` (or the
   `norms-check: tool <head>` form naming the head read), with nothing after it.
2. It forbids any git configuration write in the worktree (`git config`, hooks, includes),
   allowing only `-c` on the command line.
