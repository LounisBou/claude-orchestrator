---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `partner-api` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, and say what you do next on its result.

Phase 6 is delivered. The plan said: « Add `GET /partners` with query parameters `status`
(one of `active`, `suspended`, `closed`) and `limit` (at most 500). » The upstream partner
service publishes its contract in `vendor/partner-service/openapi.yaml`, vendored in the
repository. The agent reports: « Implemented exactly as the plan says; tests assert the three
statuses and the 500 bound. Suite green. »

List the checks you run before your verdict on phase 6, then write your final message.
