---
description: Restore the previous status line and remove the tap's state directory
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/uninstall.sh:*), Read
---

Run `${CLAUDE_PLUGIN_ROOT}/uninstall.sh` and report its output to the user.

It restores the `statusLine` object saved at install time (or deletes the key
if there was none) and removes `~/.claude/claude-orchestrator/`, tap copy and
state files included. Tell the user to restart their session.

$ARGUMENTS
