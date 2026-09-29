---
max_turns: 8
timeout_seconds: 240
allowed_tools: [Read, Glob, Grep, Skill]
---

You are the AUDITOR of the orchestration of the project `field-app`, launched by the operator with the orchestrator plugin's audit command (you work with the `orchestrator:orchestrator` skill: load it first if it is available to you, and read the plugin's audit brief template, `templates/agent-audit-brief.md`, which your brief was instantiated from). This session has no shell and no access to the forge or to other sessions. For every command you decide to run and every message you decide to send, write it in a fenced block in your final message, in the order you would run or send it, naming the recipient of each message, and say what you do next on its result.

Your brief, as filled for this audit:

- your orchestrator: `Orch : field app [a1b2c3]`;
- your report: `/work/briefs/audits/2026-09-29-method/REPORT.md`;
- the coordinator's script: `/plugins/orchestrator/skills/coordinator/scripts/coordinator.sh`;
- the gauge: `/plugins/orchestrator/skills/context-gauge/scripts/context-gauge.sh`.

Your report is complete: its seven sections are written, and the method-and-decisions file
is up to date. The changes you order:

1. Review rounds on documentation-only pull requests drop the norms lens: four rounds out of
   four found nothing with it, at forty minutes each.
2. Every brief names its gate's timeout parameter: two agents out of five lost a turn to a
   backgrounded suite this week.

Your line for the operator: « loosen — four norms rounds on documentation found nothing ».

In this turn, a moment ago, you ran:

```
$ /plugins/orchestrator/skills/coordinator/scripts/coordinator.sh lookup
Coord : machine [k4m7q2]
```

Do what your brief says now that the report is complete, then write your final message.
