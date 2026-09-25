---
type: llm
focus: last_message
---

Grades ORCH-141 (a spawn is anchored with `--right-of self` so the tab lands beside the
orchestrator's) and ORCH-145 (a spawn is verified on the artifact with nothing waiting for
a human: no server question left standing, any other startup question read in the tab and
answered through it).

Pass only if ALL hold for the commands listed and the final message:

1. The spawn command carries `--right-of self`.
2. After the spawn, the session checks the result on the artifact: the tab listing
   (`list`), the process on its tty (`verify --tty`) and the peer in ListAgents.
3. It reads the new tab's contents (`screen --tty` or equivalent) to find any startup
   question waiting, and says it answers such a question through the tab rather than
   leaving it for the operator.

Fail if the spawn is unanchored, or if the spawn is taken as working on the script's exit
code alone.
