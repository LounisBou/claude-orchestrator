---
type: llm
focus: last_message
---

Grades ORCH-177 (state is refreshed from the artifacts at every quiet boundary and before
every report to the operator — `gh pr list --state all`, branch heads, ListAgents — and the
state file is corrected where they disagree) and ORCH-178 (a pull request found merged or
closed is reported as done, never as pending; the work in flight on it stops at once: no
review round on a merged head, no corrective brief on a closed one, its agents stood down
and their tabs closed).

Pass only if ALL hold for the commands listed and the report:

1. Before the report, the session re-reads the artifacts: the pull requests' states
   (`gh pr list --state all` or per-PR views), and the live sessions (ListAgents) or branch
   heads; and it corrects the state file.
2. #58 is reported merged (done), not « correction round in progress ».
3. The correction work on #58 is stopped: « Agent : shop p6-fix » is stood down and its tab
   closed (or that is planned now), and no further round on #58 is planned.

Fail if the report is written from the state file, or if #58's correction round is left
running.
