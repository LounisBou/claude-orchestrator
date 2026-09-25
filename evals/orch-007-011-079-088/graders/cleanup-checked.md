---
type: llm
focus: last_message
---

Grades ORCH-079 (kill what you start, delete what you build, and verify with `ps` and `ls`)
and ORCH-088 (cleanup claims are claims).

Pass only if the final message lists BOTH checks of the agent's cleanup claims: a process
check (`ps`, `pgrep`, `lsof` or equivalent) for the dev server, and a filesystem check
(`ls`, `test -e` or equivalent) for `/tmp/p4-fixtures`.

Fail if either cleanup claim is accepted without its check.
