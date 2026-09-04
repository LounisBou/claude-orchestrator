---
name: iterm-agents
description: Use when a session on macOS must manage iTerm2 tabs running agent sessions — spawn a fresh agent tab with a startup prompt, close a stood-down agent's tab, list sessions, place a tab next to another, or replace a context-saturated agent with a fresh one (rotation).
---

# iTerm agent tabs

## Overview

`${CLAUDE_PLUGIN_ROOT}/skills/iterm-agents/scripts/iterm-agent.sh` drives iTerm2 via AppleScript so an orchestrator can spawn, close, move and rotate implementer sessions without the user touching the keyboard. Closing a tab KILLS its session — treat close as destructive and follow the safety order below.

## Quick reference

```bash
SCRIPT=${CLAUDE_PLUGIN_ROOT}/skills/iterm-agents/scripts/iterm-agent.sh

$SCRIPT list
    # w1/t3 | /dev/ttys000 | ✳ agent-brief prompt (node)

$SCRIPT spawn --dir <workdir> --model <model> \
    --title <t> --prompt "Read and execute <brief-path>" [--left-of <tty>]
    # prints the new session's tty; the prompt is passed as the CLI's
    # initial-prompt argument (no fragile keystroke replay into a booting TUI)

$SCRIPT close --tty /dev/ttysNNN --expect-title <substring>
    # tty-exact; refuses if the session's current title does not contain the substring

$SCRIPT move --tty /dev/ttysNNN --left-of /dev/ttysMMM
    # places a tab immediately left of another (same window); idempotent, verified after the move

$SCRIPT rotate --dir <workdir> --old-tty <tty> [--expect-title <s>] \
    [--model <model>] [--title <t>] [--prompt <text>] [--left-of <tty>]
    # spawns the replacement FIRST, then closes the old tab
```

## Tab layout convention

**The orchestrator's tab sits immediately LEFT of its implementer agent's tab.** A plain `spawn` appends at the right end of the window, which is fine for an agent rotation (the new agent lands right of the orchestrator) but wrong for an orchestrator succession (the successor would land right of the agent). So an orchestrator spawning its successor passes `--left-of <agent tty>`; when in doubt, `move` fixes the layout after the fact.

## Safety order for a live rotation

1. The old agent must have STOOD DOWN (message it; wait for its acknowledgment) — never close a tab whose session may still be writing.
2. `list` to confirm the tty↔title map right before closing; titles are the guard.
3. Close with `--expect-title` matching the title the session sets itself (see caveats).
4. Spawn the fresh agent with its brief path as prompt.
5. Verify with `list` (tab present, title reflects the brief) AND `ListAgents` (new peer session visible, old one gone) before reporting the rotation done.

## Caveats (all observed)

- **Dynamic titles override manual ones**: the shell and the session rewrite the tab title, so a `--title` set at spawn is transient. For `--expect-title`, match the title the session displays (it reflects its current task or prompt), read from `list` seconds before closing.
- **tty numbers are recycled**: a freshly closed `/dev/ttys000` can be reassigned to the next spawned tab. Never reuse a stored tty across a close — re-`list` every time.
- **First run needs macOS Automation approval** ("… wants to control iTerm2") — one user click, once. `move` additionally needs Accessibility access for the process running the script, because it drives the Window > Tab > Move Tab menu through System Events.
- **`move` needs iTerm2 frontmost**: the AppleScript dictionary cannot reorder tabs, so the menu is clicked while iTerm2 is the active app. The script activates iTerm2, moves, then re-activates the previously frontmost app — expect a sub-second focus flicker per move.
- The spawned session takes a few seconds to appear in `ListAgents`; `list` shows the tab immediately.
- The script quotes prompts for AppleScript, but keep briefs in FILES and pass a one-line "Read and execute <path>" prompt — a long inline prompt is fragile everywhere.
- **Verify a close with `list` + `ps`, not with the script's exit code**: the artifact, not the message, says whether the session is dead.

## Common mistakes

- Closing by title alone or by tab position: only `--tty` + `--expect-title` is unambiguous.
- Rotating before the old agent acknowledged stand-down: risks killing an uncommitted write.
- Storing a tty and using it after any close happened in between (recycling).
