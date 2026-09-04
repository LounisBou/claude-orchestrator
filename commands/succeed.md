---
description: Hand the orchestration over to a fresh successor session
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/skills/iterm-agents/scripts/iterm-agent.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/context-gauge/scripts/context-gauge.sh:*), Read, Write, Edit, ListAgents, SendMessage
---

Execute the orchestrator succession described in
`claude-orchestrator:orchestrator`. Load that skill first.

Preconditions, verify each before acting:

- the moment is quiet: no verdict pending, no agent mid-delivery;
- the project state file is current — status lives once, there;
- the standing succession brief exists; otherwise instantiate
  `${CLAUDE_PLUGIN_ROOT}/templates/orchestrator-succession-brief.md` into the
  project's briefs directory, filling every `{{PLACEHOLDER}}`.

Then:

1. `iterm-agent.sh list` — note your own tty and the implementer's tty.
2. `iterm-agent.sh spawn --dir <worktree> --model <model> --title orchestrator
   --left-of <implementer tty> --prompt "Read and execute <brief path>"`.
3. Answer nothing new. Wait for the successor's "takeover confirmed"; answer
   its questions about state only.
4. Never close your own tab: the successor closes it once you are idle.

$ARGUMENTS
