#!/bin/bash
# iterm-agent.sh — iTerm2 session management for the orchestrator (macOS).
# Lets an orchestrator session list, spawn, close and rotate implementer-agent
# tabs. Closing is tty-exact and refuses ambiguity by construction.
#
# Usage:
#   iterm-agent.sh list
#   iterm-agent.sh spawn --dir <path> [--model opus] [--permission-mode auto] [--title <t>] [--prompt <text>] [--left-of /dev/ttysNNN]
#   iterm-agent.sh close --tty /dev/ttysNNN [--expect-title <substring>]
#   iterm-agent.sh move --tty /dev/ttysNNN --left-of /dev/ttysMMM
#   iterm-agent.sh rotate --dir <path> --old-tty /dev/ttysNNN [--model opus] [--permission-mode auto] [--title <t>] [--prompt <text>] [--expect-title <substring>] [--left-of /dev/ttysMMM]
#
# Safety model:
#   - `close` targets a tty (unique per session). If --expect-title is given, the
#     session's current title must contain it, or the close is refused.
#   - `rotate` spawns the replacement FIRST, then closes the old session, so a
#     spawn failure never leaves you with zero agents.
#   - `spawn` quotes the prompt for AppleScript and passes it as the host CLI
#     initial-prompt argument: no fragile keystroke replay into a booting TUI.
#   - `move` places a tab immediately left of another one (same window). iTerm2's
#     AppleScript dictionary cannot reorder tabs, so it drives the Window > Tab >
#     Move Tab menu through System Events; that needs iTerm2 frontmost for the
#     duration of the move, and the previously frontmost app is restored after.

set -euo pipefail

# The host CLI to launch in a spawned tab; override for a wrapper or a renamed binary.
HOST_CLI="${ORCHESTRATOR_HOST_CLI:-claude}"

die() { echo "ERROR: $*" >&2; exit 1; }

osa() { osascript -e "$1"; }

applescript_quote() {
    # Escape backslashes then double quotes for embedding in an AppleScript string.
    printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
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

cmd_spawn() {
    # The decision mode defaults to the operator's own: a successor or a replacement agent
    # spawned into a stricter mode stops at its first permission prompt in a tab nobody is
    # watching, and the build stalls exactly where the rotation was meant to keep it moving.
    local dir="" model="opus" mode="auto" title="agent" prompt="" left_of=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --dir) dir="$2"; shift 2 ;;
            --model) model="$2"; shift 2 ;;
            --permission-mode) mode="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --prompt) prompt="$2"; shift 2 ;;
            --left-of) left_of="$2"; shift 2 ;;
            *) die "spawn: unknown option $1" ;;
        esac
    done
    [ -n "$dir" ] || die "spawn: --dir is required"
    [ -d "$dir" ] || die "spawn: directory not found: $dir"

    # The tab title is set through the shell escape sequence before the session starts,
    # so `close --expect-title` has something stable to check.
    local shellcmd="cd $(printf '%q' "$dir") && printf '\\033]0;%s\\007' $(printf '%q' "$title") && $HOST_CLI --model $(printf '%q' "$model") --permission-mode $(printf '%q' "$mode")"
    if [ -n "$prompt" ]; then
        shellcmd="$shellcmd $(printf '%q' "$prompt")"
    fi

    local qcmd new_tty
    qcmd=$(applescript_quote "$shellcmd")
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
    local dir="" model="opus" mode="auto" title="agent" prompt="" old_tty="" expect_title="" left_of=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --dir) dir="$2"; shift 2 ;;
            --model) model="$2"; shift 2 ;;
            --permission-mode) mode="$2"; shift 2 ;;
            --title) title="$2"; shift 2 ;;
            --prompt) prompt="$2"; shift 2 ;;
            --old-tty) old_tty="$2"; shift 2 ;;
            --expect-title) expect_title="$2"; shift 2 ;;
            --left-of) left_of="$2"; shift 2 ;;
            *) die "rotate: unknown option $1" ;;
        esac
    done
    [ -n "$old_tty" ] || die "rotate: --old-tty is required"

    local new_tty
    new_tty=$(cmd_spawn --dir "$dir" --model "$model" --permission-mode "$mode" --title "$title" ${prompt:+--prompt "$prompt"} ${left_of:+--left-of "$left_of"})
    echo "spawned replacement on $new_tty"

    local close_args=(--tty "$old_tty")
    [ -n "$expect_title" ] && close_args+=(--expect-title "$expect_title")
    cmd_close "${close_args[@]}"
}

case "${1:-}" in
    list)   shift; cmd_list "$@" ;;
    spawn)  shift; cmd_spawn "$@" ;;
    close)  shift; cmd_close "$@" ;;
    move)   shift; cmd_move "$@" ;;
    rotate) shift; cmd_rotate "$@" ;;
    *) die "usage: iterm-agent.sh {list|spawn|close|move|rotate} [options] (see header)" ;;
esac
