#!/usr/bin/env bash
# The launcher's own push guard, enforced by the harness rather than remembered by the
# model — the same reasoning as hooks/context-gate.sh.
#
# Active only in a session the launcher spawned: iterm_agent.py's build_command exports
# ORCHESTRATOR_SPAWNED=1 in the launch command it hands the app, and this hook does
# nothing unless that is set. The operator's own sessions carry no such marker and are
# never touched by it.
#
# WHY A HOOK. Phase 3 ruling 5: a rebase is pushed with `--force-with-lease=<branch>:<sha
# read>`, the only force allowed; every other force push stays refused. A sentence the
# model must remember is a sentence it can rationalise away under pressure to "just get
# the branch up"; a check the harness runs before the command executes is not.
#
# Runs on PreToolUse for Bash. Refuses `git push` carrying `--force`, `-f`, a
# `+<refspec>`, or `--force-with-lease` without the `<branch>:<sha>` form. A plain push and
# `--force-with-lease=<branch>:<sha>` pass.
set -u

[ -n "${ORCHESTRATOR_SPAWNED:-}" ] || exit 0

payload="$(cat 2>/dev/null || true)"
tool_name="$(printf '%s' "$payload" | jq -r '.tool_name // empty' 2>/dev/null)"
[ "$tool_name" = "Bash" ] || exit 0

command="$(printf '%s' "$payload" | jq -r '.tool_input.command // empty' 2>/dev/null)"
[ -n "$command" ] || exit 0

deny() {
    local reason="$1"
    printf '{"hookSpecificOutput": {"permissionDecision": "deny"}, "systemMessage": %s}\n' \
        "$(printf '%s' "$reason" | jq -R -s '.' 2>/dev/null || printf '"%s"' "$reason")" >&2
    exit 2
}

# A segment is "forced" when it carries --force (but not --force-with-lease, which is a
# longer token starting the same way), a standalone -f, a +<refspec>, or a
# --force-with-lease that is not exactly --force-with-lease=<branch>:<sha>.
is_forced() {
    local seg="$1"
    printf '%s' "$seg" | grep -qE -- '--force([^-]|$)' && return 0
    printf '%s' "$seg" | grep -qE -- '(^|[[:space:]])-f([[:space:]]|$)' && return 0
    printf '%s' "$seg" | grep -qE -- '(^|[[:space:]])\+[^[:space:]]+' && return 0
    if printf '%s' "$seg" | grep -qE -- '--force-with-lease'; then
        printf '%s' "$seg" | grep -qE -- '--force-with-lease=[^[:space:]:=]+:[^[:space:]]+' || return 0
    fi
    return 1
}

# The command is a whole shell line, possibly several piped or chained together; only the
# segment that is actually a `git push` is read for a forcing flag, so a `-f` on an
# unrelated command earlier in the same line is not read as forcing the push.
while IFS= read -r segment; do
    printf '%s' "$segment" | grep -qE '(^|[[:space:]])git[[:space:]]+push([[:space:]]|$)' || continue
    if is_forced "$segment"; then
        deny "git push refused: this is a launcher-spawned session, and only --force-with-lease=<branch>:<sha> is allowed here (phase 3 ruling 5). --force, -f, a +<refspec>, and --force-with-lease without <branch>:<sha> are all refused."
    fi
done < <(printf '%s\n' "$command" | sed -E 's/(&&|\|\||;|\|)/\n/g')

exit 0
