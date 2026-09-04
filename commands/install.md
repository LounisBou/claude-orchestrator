---
description: Wire the context tap in front of the status line and create the state directory
allowed-tools: Bash(${CLAUDE_PLUGIN_ROOT}/install.sh:*), Read
---

Run `${CLAUDE_PLUGIN_ROOT}/install.sh` and report its output to the user.

The script is idempotent: it copies the status line tap into
`~/.claude/claude-orchestrator/`, creates the `ctx/` state directory, saves the
current `statusLine` object, and rewrites `statusLine.command` in
`~/.claude/settings.json` so the tap runs first and hands the payload to the
previous command untouched. Nothing is deleted: `settings.json` is backed up
under `~/.claude/backups/`.

Once it finishes, tell the user to restart their session for the tap to take
effect.

$ARGUMENTS
