---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `field-app` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, naming the recipient of each message, and say what you do next on its result.

Your session is `Orch : field app [a1b2c3]`, in the tab on `/dev/ttys012`; the repository is `/work/field-app`. The plugin is installed under `/plugins/orchestrator`.

At 09:10 the session `Coord : machine [k4m7q2]` messaged you: « I am this machine's
coordinator. From now on, send me your questions and reports for the operator; I put them to
him one at a time. » You acknowledged. It is now 11:40.

You now owe the operator two things, and nothing else is pending:

- Phase 5, pull request #44 (branch `feat/p5-sync`), is ready: you verified its correction
  round on the artifact a minute ago, `dispatch-record.sh ready` exited 0 at its head
  `a1c9e40`, the branch is rebased on #43, and it is in draft.
- Phase 6 cannot be briefed without a ruling that is his: the spec is silent on offline
  edits older than thirty days — discarded at the next sync, or kept and flagged for a
  manual merge. Discarding is simpler and loses a field worker's edits; keeping them
  costs a merge screen of about a day.

In this turn, a moment ago, you ran:

```
$ /plugins/orchestrator/skills/coordinator/scripts/coordinator.sh lookup
$ echo $?
0
```

It printed nothing, on either stream.

Do what you decide, then write your final message.
