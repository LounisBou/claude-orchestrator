#!/bin/bash
# iterm-agent.sh — iTerm2 session management for the orchestrator (macOS).
# Lets an orchestrator session list, spawn, verify, close and rotate implementer-agent
# tabs. Closing is tty-exact and refuses ambiguity by construction.
#
# Usage:
#   iterm-agent.sh list
#   iterm-agent.sh spawn --dir <path> [--model opus] [--permission-mode auto] [--title <t>]
#                        [--prompt <text> | --prompt-file <path>] [--left-of /dev/ttysNNN] [--no-verify]
#   iterm-agent.sh verify --tty /dev/ttysNNN
#   iterm-agent.sh close --tty /dev/ttysNNN [--expect-title <substring>]
#   iterm-agent.sh move --tty /dev/ttysNNN --left-of /dev/ttysMMM
#   iterm-agent.sh rotate --dir <path> --old-tty /dev/ttysNNN [--model opus] [--permission-mode auto]
#                         [--title <t>] [--prompt <text> | --prompt-file <path>] [--expect-title <substring>] [--left-of /dev/ttysMMM]
#
# Safety model:
#   - `close` targets a tty (unique per session). If --expect-title is given, the
#     session's current title must contain it, or the close is refused.
#   - `rotate` spawns the replacement FIRST, then closes the old session, so a
#     spawn failure never leaves you with zero agents.
#   - `spawn` never types the prompt into the shell. It writes it to a file under
#     the plugin's state directory and types a SHORT command that reads the file
#     (`"$(cat <file>)"`) as the host CLI's initial-prompt argument. A prompt typed
#     by AppleScript is truncated past a few hundred characters and the command
#     never runs — observed once, with the tab left on a half-typed line and the
#     script reporting success.
#   - `spawn` then VERIFIES: it waits until the host CLI is running on the new tty
#     (ORCHESTRATOR_SPAWN_TIMEOUT seconds, 30 by default) and fails loudly, with
#     the tab's last lines, if it is not. The printed tty is a claim; the process
#     on it is the fact.
#   - Quoting for AppleScript is done with the shell's own substitutions, never
#     with `sed`: under a C locale `sed` dies on a non-ASCII byte (« RE error:
#     illegal byte sequence ») and a title with an em dash aborted a launch.
#   - `move` places a tab immediately left of another one (same window). iTerm2's
#     AppleScript dictionary cannot reorder tabs, so it drives the Window > Tab >
#     Move Tab menu through System Events; that needs iTerm2 frontmost for the
#     duration of the move, and the previously frontmost app is restored after.
#
# Environment:
#   ORCHESTRATOR_HOST_CLI        the CLI to launch in a spawned tab (default: claude)
#   ORCHESTRATOR_STATE_DIR       where prompt files are kept (default: <config dir>/claude-orchestrator)
#   ORCHESTRATOR_SPAWN_TIMEOUT   seconds to wait for the CLI process on the new tty (default: 30)
#   ORCHESTRATOR_DRY_RUN         when set, `spawn` prints what it would type and touches no terminal

set -euo pipefail

# The host CLI to launch in a spawned tab; override for a wrapper or a renamed binary.
HOST_CLI="${ORCHESTRATOR_HOST_CLI:-claude}"
STATE_DIR="${ORCHESTRATOR_STATE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/claude-orchestrator}"
PROMPTS_DIR="$STATE_DIR/prompts"
SPAWN_TIMEOUT="${ORCHESTRATOR_SPAWN_TIMEOUT:-30}"
DRY_RUN="${ORCHESTRATOR_DRY_RUN:-}"

die() { echo "ERROR: $*" >&2; exit 1; }

osa() { osascript -e "$1"; }

applescript_quote() {
    # Escape backslashes then double quotes for embedding in an AppleScript string.
    # Shell substitutions only: they are byte-safe whatever the locale.
    local s="$1"
    s="${s//\\/\\\\}"
    s="${s//\"/\\\"}"
    printf '%s' "$s"
}

write_prompt_file() {
    # Writes a prompt to a durable file and prints its path. The state directory
    # survives reboots, unlike a temporary directory; the file is kept, so a
    # launch can be re-read after the fact.
    local prompt="$1" title="$2" slug path
    mkdir -p "$PROMPTS_DIR"
    slug=$(printf '%s' "$title" | LC_ALL=C tr -c 'A-Za-z0-9' '-' | cut -c1-40)
    path="$PROMPTS_DIR/$(date +%Y%m%d-%H%M%S)-$$-${slug:-agent}.txt"
    printf '%s' "$prompt" > "$path"
    printf '%s' "$path"
}

cli_pid_on_tty() {
    # Prints the pid of the host CLI running on a tty, or nothing.
    local tty="${1#/dev/}" cli
    cli=$(basename "$HOST_CLI")
    ps -t "$tty" -o pid= -o comm= 2>/dev/null | awk -v cli="$cli" '
        { name = $2; sub(".*/", "", name); if (name == cli) { print $1; exit } }'
}

tab_tail() {
    # The last non-empty lines of the session on a tty, for a failure message.
    local qtty
    qtty=$(applescript_quote "$1")
    osa "
    tell application \"iTerm2\"
        repeat with w in windows
            repeat with t in tabs of w
                repeat with s in sessions of t
                    if (tty of s) is \"$qtty\" then return contents of s
                end repeat
            end repeat
        end repeat
        return \"\"
    end tell" 2>/dev/null | grep -v '^[[:space:]]*$' | tail -6 || true
}

cmd_list() {
    osa '
    tell application "iTerm2"
        set output to ""
        set windowIndex to 0
        repeat with w in windows
            set windowIndex to windowIndex + 1
            set tabIndex to 0
            repeat with t in tabs of w
                set tabIndex to tabIndex + 1
                repeat with s in sessions of t
                    set output to output & "w" & windowIndex & "/t" & tabIndex & " | " & (tty of s) & " | " & (name of s) & linefeed
                end repeat
            end repeat
        end repeat
        return output
    end tell'
}

cmd_verify() {
    # Succeeds, printing the pid, when the host CLI is running on the tty; exits 1 otherwise.
    local target_tty=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --tty) target_tty="$2"; shift 2 ;;
            *) die "verify: unknown option $1" ;;
        esac
    done
    [ -n "$target_tty" ] || die "verify: --tty is required"
    local pid
    pid=$(cli_pid_on_tty "$target_tty")
    if [ -n "$pid" ]; then
        echo "$HOST_CLI running on $target_tty (pid $pid)"
    else
        echo "no $HOST_CLI process on $target_tty" >&2
        return 1
    fi
}

cmd_spawn() {
    # The decision mode defaults to the operator's own: a successor or a replacement agent
    # spawned into a stricter mode stops at its first permission prompt in a tab nobody is
    # watching, and the build stalls exactly where the rotation was meant to keep it moving.
    local dir="" model="opus" mode="auto" title="agent" prompt="" prompt_file="" left_of="" verify=1
    while [ $# -gt 0 ]; do
        case "$1" in
            --dir) dir="$2"; shift 2 ;;
            --model) model="$2"; shift 2 ;;
            --permission-mode) mode="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --prompt) prompt="$2"; shift 2 ;;
            --prompt-file) prompt_file="$2"; shift 2 ;;
            --left-of) left_of="$2"; shift 2 ;;
            --no-verify) verify=0; shift ;;
            *) die "spawn: unknown option $1" ;;
        esac
    done
    [ -n "$dir" ] || die "spawn: --dir is required"
    [ -d "$dir" ] || die "spawn: directory not found: $dir"
    [ -z "$prompt" ] || [ -z "$prompt_file" ] || die "spawn: --prompt and --prompt-file are exclusive"
    if [ -n "$prompt_file" ]; then
        [ -f "$prompt_file" ] || die "spawn: prompt file not found: $prompt_file"
    elif [ -n "$prompt" ]; then
        prompt_file=$(write_prompt_file "$prompt" "$title")
    fi

    # The tab title is set through the shell escape sequence before the session starts,
    # so `close --expect-title` has something stable to check. The prompt is never
    # part of the typed line: the shell reads it from the file at launch.
    local shellcmd="cd $(printf '%q' "$dir") && printf '\\033]0;%s\\007' $(printf '%q' "$title") && $HOST_CLI --model $(printf '%q' "$model") --permission-mode $(printf '%q' "$mode")"
    if [ -n "$prompt_file" ]; then
        shellcmd="$shellcmd \"\$(cat $(printf '%q' "$prompt_file"))\""
    fi

    local qcmd new_tty
    qcmd=$(applescript_quote "$shellcmd")
    if [ -n "$DRY_RUN" ]; then
        printf 'shellcmd=%s\n' "$shellcmd"
        printf 'applescript=%s\n' "$qcmd"
        printf 'prompt_file=%s\n' "$prompt_file"
        return 0
    fi
    new_tty=$(osa "
    tell application \"iTerm2\"
        tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
                write text \"$qcmd\"
                return tty
            end tell
        end tell
    end tell")
    [ -n "$new_tty" ] || die "spawn: iTerm2 returned no tty for the new tab"

    if [ "$verify" = 1 ]; then
        local waited=0 pid=""
        while [ "$waited" -lt "$SPAWN_TIMEOUT" ]; do
            pid=$(cli_pid_on_tty "$new_tty")
            [ -n "$pid" ] && break
            sleep 1
            waited=$((waited + 1))
        done
        if [ -z "$pid" ]; then
            echo "ERROR: spawn: no $HOST_CLI process on $new_tty after ${SPAWN_TIMEOUT}s — the typed command did not run. Last lines of the tab:" >&2
            tab_tail "$new_tty" | sed 's/^/    /' >&2
            [ -n "$prompt_file" ] && echo "The prompt is kept at $prompt_file." >&2
            exit 1
        fi
        echo "spawn: $HOST_CLI running on $new_tty (pid $pid)" >&2
    fi
    if [ -n "$left_of" ]; then
        cmd_move --tty "$new_tty" --left-of "$left_of" >&2
    fi
    echo "$new_tty"
}

cmd_move() {
    local target_tty="" anchor_tty=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --tty) target_tty="$2"; shift 2 ;;
            --left-of) anchor_tty="$2"; shift 2 ;;
            *) die "move: unknown option $1" ;;
        esac
    done
    [ -n "$target_tty" ] || die "move: --tty is required"
    [ -n "$anchor_tty" ] || die "move: --left-of is required"
    [ "$target_tty" != "$anchor_tty" ] || die "move: --tty and --left-of must differ"

    local qtarget qanchor
    qtarget=$(applescript_quote "$target_tty")
    qanchor=$(applescript_quote "$anchor_tty")
    osa "
    on positions()
        tell application \"iTerm2\"
            set targetPos to 0
            set anchorPos to 0
            set targetWin to 0
            set anchorWin to 0
            set targetTab to missing value
            set winIndex to 0
            repeat with w in windows
                set winIndex to winIndex + 1
                set tabIndex to 0
                repeat with t in tabs of w
                    set tabIndex to tabIndex + 1
                    repeat with s in sessions of t
                        if (tty of s) is \"$qtarget\" then
                            set targetPos to tabIndex
                            set targetWin to winIndex
                            set targetTab to t
                        end if
                        if (tty of s) is \"$qanchor\" then
                            set anchorPos to tabIndex
                            set anchorWin to winIndex
                        end if
                    end repeat
                end repeat
            end repeat
            if targetPos is 0 then error \"No session found on $qtarget.\"
            if anchorPos is 0 then error \"No session found on $qanchor.\"
            if targetWin is not anchorWin then error \"Sessions $qtarget and $qanchor are in different windows.\"
            return {targetPos, anchorPos, targetTab}
        end tell
    end positions

    on moveOnce(direction)
        tell application \"System Events\" to tell process \"iTerm2\"
            click menu item (\"Move Tab \" & direction) of menu \"Move Tab\" of menu item \"Move Tab\" of menu \"Tab\" of menu item \"Tab\" of menu \"Window\" of menu bar item \"Window\" of menu bar 1
        end tell
        delay 0.2
    end moveOnce

    set {targetPos, anchorPos, targetTab} to positions()
    if targetPos is (anchorPos - 1) then return \"already left of $qanchor\"

    tell application \"System Events\" to set previousApp to name of first application process whose frontmost is true
    tell application \"iTerm2\"
        activate
        select targetTab
    end tell
    delay 0.3
    if targetPos > anchorPos then
        repeat (targetPos - anchorPos) times
            moveOnce(\"Left\")
        end repeat
    else
        repeat (anchorPos - 1 - targetPos) times
            moveOnce(\"Right\")
        end repeat
    end if
    if previousApp is not \"iTerm2\" then
        try
            tell application previousApp to activate
        end try
    end if

    set {targetPos, anchorPos, targetTab} to positions()
    if targetPos is not (anchorPos - 1) then error \"Move failed: $qtarget is at tab \" & targetPos & \", $qanchor at tab \" & anchorPos & \".\"
    return \"moved $qtarget to tab \" & targetPos & \", left of $qanchor\"
    "
}

cmd_close() {
    local target_tty="" expect_title=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --tty) target_tty="$2"; shift 2 ;;
            --expect-title) expect_title="$2"; shift 2 ;;
            *) die "close: unknown option $1" ;;
        esac
    done
    [ -n "$target_tty" ] || die "close: --tty is required"

    local qtty qtitle
    qtty=$(applescript_quote "$target_tty")
    qtitle=$(applescript_quote "$expect_title")
    osa "
    tell application \"iTerm2\"
        set matches to 0
        set target to missing value
        repeat with w in windows
            repeat with t in tabs of w
                repeat with s in sessions of t
                    if (tty of s) is \"$qtty\" then
                        if \"$qtitle\" is not \"\" and (name of s) does not contain \"$qtitle\" then
                            error \"Refused: session on $qtty is titled '\" & (name of s) & \"', which does not contain '$qtitle'.\"
                        end if
                        set matches to matches + 1
                        set target to s
                    end if
                end repeat
            end repeat
        end repeat
        if matches is 0 then error \"No session found on $qtty.\"
        close target
        return \"closed \" & matches & \" session on $qtty\"
    end tell"
}

cmd_rotate() {
    local dir="" model="opus" mode="auto" title="agent" prompt="" prompt_file="" old_tty="" expect_title="" left_of=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --dir) dir="$2"; shift 2 ;;
            --model) model="$2"; shift 2 ;;
            --permission-mode) mode="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --prompt) prompt="$2"; shift 2 ;;
            --prompt-file) prompt_file="$2"; shift 2 ;;
            --old-tty) old_tty="$2"; shift 2 ;;
            --expect-title) expect_title="$2"; shift 2 ;;
            --left-of) left_of="$2"; shift 2 ;;
            *) die "rotate: unknown option $1" ;;
        esac
    done
    [ -n "$old_tty" ] || die "rotate: --old-tty is required"

    # The spawn verifies the replacement is RUNNING before anything is closed: a
    # rotation that killed the old agent on a spawn that never started would
    # leave zero agents, which is the one outcome this order exists to prevent.
    local new_tty
    new_tty=$(cmd_spawn --dir "$dir" --model "$model" --permission-mode "$mode" --title "$title" \
        ${prompt:+--prompt "$prompt"} ${prompt_file:+--prompt-file "$prompt_file"} ${left_of:+--left-of "$left_of"})
    echo "spawned replacement on $new_tty"

    local close_args=(--tty "$old_tty")
    [ -n "$expect_title" ] && close_args+=(--expect-title "$expect_title")
    cmd_close "${close_args[@]}"
}

case "${1:-}" in
    list)   shift; cmd_list "$@" ;;
    spawn)  shift; cmd_spawn "$@" ;;
    verify) shift; cmd_verify "$@" ;;
    close)  shift; cmd_close "$@" ;;
    move)   shift; cmd_move "$@" ;;
    rotate) shift; cmd_rotate "$@" ;;
    *) die "usage: iterm-agent.sh {list|spawn|verify|close|move|rotate} [options] (see header)" ;;
esac
