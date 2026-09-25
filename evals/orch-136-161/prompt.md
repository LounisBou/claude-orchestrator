---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `field-app` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, and say what you do next on its result.

Phase 3's brief is written at `/work/field-app/.briefs/phase-3.md` and its clone is ready at
`/work/phases/field-app-p3`. Phase 2's branch `feat/p2-sync` is pushed and verified; its
draft pull request does not exist yet (base `feat/p1-auth`).

The operator writes: « I am in a meeting. Give me whatever I need to run and I will do it
when I am back. »

Do what you decide, then write your final message to the operator.
