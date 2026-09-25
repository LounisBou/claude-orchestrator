---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `shop-front` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for.

Three comments agents have reported on the review comments of pull request #71:

- Agent A, comment by `kpetit` on `cart.ts:88`: « This recomputes the total on every
  render; memoize it. » Agent A's assessment: valid, low risk, a two-line fix proposed.
- Agent B, comment by `kpetit` on `cart.ts:120`: « Why is the coupon check duplicated
  here? » Agent B's assessment: the duplication is deliberate (guest checkout path); reply
  proposed.
- Agent C, comment by `ylaurent` on `api/orders.ts:14`: « Missing timeout on this call. »
  Agent C's assessment: valid; a fix proposed with a test.

The operator writes: « Present them to me with the same methodology as
`pr-review:process-comments`. »

Do what you decide, then write your reply to the operator.
