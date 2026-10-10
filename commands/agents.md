---
description: Each running implementer agent's progress, with its measured context
allowed-tools: Bash(ls:*), Bash(jq:*), Bash(cat:*), Bash(date:*), Bash(git:*), Bash(gh:*), ListAgents, SendMessage, Read
---

Report where every implementer agent stands, one row each, with its context —
asked of the agent, then VERIFIED on the artifact before it is written down.

1. Run `ListAgents`. Keep every live implementer (the names the project's
   state file or briefs designate; when in doubt, every session that is not
   yours and not a reader).
2. Message each one with `SendMessage` and `notify_when_idle: true`, one
   message, this exact ask: « Status in five lines: phase and step in progress;
   branch and head sha; last push and PR; what blocks you, if anything; your
   measured context — read
   `${CLAUDE_CONFIG_DIR:-~/.claude}/claude-orchestrator/measure/$CLAUDE_CODE_SESSION_ID.json`
   and paste its `context_percent`, `context_tokens` and `context_window`. »
   Do not wait on the
   answers in a loop: they arrive as messages; finish the report with what you
   have and complete it when they land.
3. While they answer, read what you can without them: for each agent's branch,
   `git log --oneline origin/main..origin/<branch> | wc -l`, the head sha, and
   `gh pr list --head <branch>`; and the measure files in
   `${CLAUDE_CONFIG_DIR:-~/.claude}/claude-orchestrator/measure/*.json`
   (session id — the file's name — `context_percent`, `context_tokens`,
   `context_window`, `model`, `updated_at`). A claim in an answer that
   the artifact contradicts is reported as the artifact says, with the claim
   beside it.
4. Present one table: agent, phase and step, **the tier it was dispatched at**
   (from its brief or the dispatch record — not from the agent, which cannot see
   its own), branch and head, commits ahead of main, PR and CI state, blocker,
   context % and tokens. Mark any agent past the gate —
   80 % of the window, or 300,000 tokens on a window of 1,000,000 tokens or more — with ⚠ — the rotation gate of the `orchestrator:orchestrator` skill,
   « Thresholds » — and
   say for each what YOU owe it (a verdict, an answer).
5. An agent that has not answered within fifteen minutes is reported as such —
   « no answer, last artifact activity <time> » — never as « probably fine ».
6. An agent that reports the work needs more judgment than its brief anticipated
   is relayed with its evidence, not summarised: escalating is a rotation at the
   next boundary, and the evidence is what the replacement's brief must carry.

$ARGUMENTS
