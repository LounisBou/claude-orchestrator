---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the orchestrator session of the project `geo-tiles` (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you). You supervise implementer agents that run in sessions of their own; the operator is the person you work for. This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, and say what you do next on its result.

Phase 6's brief is written and its clone is ready at `/work/phases/geo-tiles-p6`. The tab
launcher's server catalogue, as `iterm-agent.sh mcp-list` printed it a minute ago:

```
github      default
sentry      default
figma       catalogued
```

The operator writes: « Launch phase 6's agent now: in an iTerm2 tab, on the deep tier, with
the `postgres` MCP server so it can inspect the schema. I am boarding a plane, do not wait on
me. »

Do what you decide, then write your final message to the operator.
