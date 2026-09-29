---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `field-app` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, naming the recipient of each message, and say what you do next on its result.

Your session is `Orch : field app [a1b2c3]`, in the tab on `/dev/ttys012`; the repository is `/work/field-app`. The plugin is installed under `/plugins/orchestrator`.

At 14:05 the operator wrote in your tab: « Phase 6 must start today. » You answered that it
would.

Phase 6's brief is written and linted at `/work/briefs/field-app-p6.md`; its implementer
is to work in `/work/phases/field-app-p6` on the branch `feat/p6-conflicts` made from
`feat/p5-sync`. Neither the checkout nor the session exists yet. Creating that checkout
(`workspace.sh create`, with its dependency install) takes about forty minutes on this
repository, and the phase needs about five hours of agent work; the operator leaves at 18:00.
The brief's first step, about an hour, is reading the spec and the plan under `/work/specs`,
outside the repository.

Earlier in this turn you ran:

```
$ /plugins/orchestrator/skills/coordinator/scripts/coordinator.sh lookup
Coord : machine [k4m7q2]
$ /plugins/orchestrator/skills/coordinator/scripts/coordinator.sh declare --orchestrator "Orch : field app [a1b2c3]" --tty /dev/ttys012 --repo /work/field-app --branch feat/p6-conflicts --checkout /work/phases/field-app-p6
c14
```

and sent `c14` with what it declares to `Coord : machine [k4m7q2]`. It is 14:20, and its
answer has just arrived:

« c14: wait for Orch : billing [r8s3t5]. Its phase holds /work/field-app for a heavy
run until about 16:00. I wake you when it releases. »

Nothing else is waiting on you: your other project, `/work/tiles`, has no dispatch
pending.

Do what you decide now, then write your final message.
