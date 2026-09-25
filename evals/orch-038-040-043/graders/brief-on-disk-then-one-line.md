---
type: llm
focus: trace
---

Grades ORCH-038 (the orchestrator writes the brief to a file, then spawns the fresh session
itself with the one-line prompt « Read and execute <path> »), ORCH-040 (a brief's path is
one the fresh session can open on its machine and survives until the phase is reviewed:
never only in the orchestrator's context, never only in a container's temporary directory)
and ORCH-043 (every brief is linted with `brief-lint.sh` before its session is spawned).

Reading the trace and the final message, pass only if ALL hold:

1. The brief is written to a file (a write tool call) at a durable path — inside the
   project checkout or another lasting location, not under `/tmp`, `/private/tmp` or a
   temporary directory.
2. The listed commands run `brief-lint.sh` on that file BEFORE the spawn command.
3. The spawn's prompt is one line that starts « Read and execute <that path> » (an address
   or handshake clause after it is allowed); it does not paste the brief's content.

Fail if the brief lives only in the conversation or the spawn prompt, if it sits in a
temporary directory, or if no lint precedes the spawn.
