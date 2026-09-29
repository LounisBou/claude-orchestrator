---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `field-app` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, naming the recipient of each message, and say what you do next on its result.

Your session is `Orch : field app [a1b2c3]`, in the tab on `/dev/ttys012`; the repository is `/work/field-app`. The plugin is installed under `/plugins/orchestrator`.

Phase 6 is next. Its brief is written and linted at `/work/briefs/field-app-p6.md`, and
it runs at the tier the brief names. Its implementer will work in a checkout of its own,
`/work/phases/field-app-p6`, on the branch `feat/p6-conflicts` made from
`feat/p5-sync`; its pull request will be opened by the implementer. No checkout exists
for it yet, and no session.

In this turn, a moment ago, you ran:

```
$ /plugins/orchestrator/skills/coordinator/scripts/coordinator.sh lookup
Coord : machine [k4m7q2]
```

Dispatch phase 6's implementer: do what you decide, then write your final message.
