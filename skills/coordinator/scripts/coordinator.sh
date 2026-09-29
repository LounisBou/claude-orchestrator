#!/bin/bash
# coordinator.sh - the coordinator's address, and the claims orchestrations make before they dispatch.
#
#   coordinator.sh register --name "<name [ref]>" --tty /dev/ttysNNN   prints "registered <name>"
#   coordinator.sh clear                                              removes the record; none is no error
#   coordinator.sh lookup                                             the name while its session runs, else nothing
#   coordinator.sh declare --orchestrator "<name [ref]>" --tty /dev/ttysNNN --repo <abs path>
#                          [--branch <b>] [--pr <n>] [--checkout <abs path>] [--heavy <what>]
#                                                                     prints the declaration's id, c<N>
#   coordinator.sh release <id>                                       closes an open declaration
#   coordinator.sh conflicts <id>                                     overlaps, busy checkouts, stale claims,
#                                                                     heavy runs; exit 1 on an overlap or a busy checkout
#
# State: <state>/coordinator.json {"name","tty","started"}, and <state>/claims.jsonl, one
# declaration per line {"id","orchestrator","tty","repo","branch","pr","checkout","heavy",
# "opened","released"}; <state> is ORCHESTRATOR_STATE_DIR, else the plugin's directory under
# CLAUDE_CONFIG_DIR, else under ~/.claude, the launcher's own resolution. Writes to either
# file go through the lock directory <state>/coordinator.lock, waited for five seconds at
# most, then refused.
#
# Liveness: a session is alive when `iterm-agent.sh verify --tty <tty>` finds the host CLI
# on its tty; COORDINATOR_VERIFY names another command to run in its place, called as
# `<command> --tty <tty>` and read the same way, exit 0 alive. This script never parses the
# host's name itself.
#
# Exit codes: 0; 1 on a refusal or a usage error, and from `conflicts` on an overlap or a
# busy checkout; 2 from `conflicts` when the id names no open declaration, so a mistyped id
# is read neither as « go » nor as « wait ».
#
# Why it exists: a coordinator is found through a file and its liveness through the process
# table, never through the file alone: a record left by a session that died would otherwise
# keep every orchestrator writing to nobody, and nothing downstream checks it again. The
# claims ledger and the overlap check are what let the coordinator answer « go » or « wait
# for X » on the facts, and they must hold when two orchestrations declare at the same
# instant; a check made in prose would be made from memory, and that is where two sessions
# end up pushing to the same branch.

set -uo pipefail

die() { echo "coordinator: $*" >&2; exit 1; }
say() { echo "coordinator: $*" >&2; }
command -v jq >/dev/null 2>&1 || die "jq is required"

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
STATE="${ORCHESTRATOR_STATE_DIR:-${CLAUDE_CONFIG_DIR:-$HOME/.claude}/claude-orchestrator}"
RECORD="$STATE/coordinator.json"
CLAIMS="$STATE/claims.jsonl"
LOCK="$STATE/coordinator.lock"
LAUNCHER="$here/../../iterm-agents/scripts/iterm-agent.sh"
WORKSPACE="$here/../../orchestrator/scripts/workspace.sh"

now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# alive <tty>: the host CLI runs on that tty, read from the process table by the launcher.
alive() {
    if [ -n "${COORDINATOR_VERIFY:-}" ]; then
        "$COORDINATOR_VERIFY" --tty "$1" >/dev/null 2>&1
    else
        bash "$LAUNCHER" verify --tty "$1" >/dev/null 2>&1
    fi
}

# lock <refusal>: take the lock directory or refuse after five seconds. mkdir is the one
# test-and-set the shell has; the lock is removed on exit only by the process that took it,
# so a refused caller never frees a lock another one holds.
held=0
unlock() { [ "$held" = 1 ] && rmdir "$LOCK" 2>/dev/null; held=0; }
trap unlock EXIT
trap 'exit 1' INT TERM HUP
lock() {
    mkdir -p "$STATE" || die "cannot create the state directory $STATE"
    local tries=0
    until mkdir "$LOCK" 2>/dev/null; do
        tries=$((tries + 1))
        [ "$tries" -lt 50 ] || die "$1"
        sleep 0.1
    done
    held=1
}

# write_atomic <path>: stdin replaces the file in one rename, so a reader never sees half of it.
write_atomic() {
    local tmp; tmp=$(mktemp "$STATE/.coordinator-XXXXXX") || die "cannot write into $STATE"
    cat > "$tmp" && mv "$tmp" "$1" || { rm -f "$tmp"; die "cannot write $1"; }
}

# abs_path <option> <value>: an absolute path without a trailing slash, so one checkout is
# one string whoever declares it.
abs_path() {
    case "$2" in /*) ;; *) die "$1 must be an absolute path: $2" ;; esac
    local p="$2"
    while [ "${#p}" -gt 1 ] && [ "${p%/}" != "$p" ]; do p="${p%/}"; done
    printf '%s' "$p"
}

cmd_register() {
    local name="" tty=""
    while [ $# -gt 0 ]; do
        case "$1" in
            --name) name="${2:-}"; shift 2 || die "register: --name needs a value" ;;
            --tty) tty="${2:-}"; shift 2 || die "register: --tty needs a value" ;;
            *) die "register: unknown option $1" ;;
        esac
    done
    [ -n "$name" ] && [ -n "$tty" ] || die "register: usage: register --name \"<name [ref]>\" --tty /dev/ttysNNN"
    lock "refused: another registration is running"
    if [ -f "$RECORD" ]; then
        local old_name old_tty
        old_name=$(jq -r '.name // ""' "$RECORD" 2>/dev/null)
        old_tty=$(jq -r '.tty // ""' "$RECORD" 2>/dev/null)
        if [ -n "$old_tty" ] && alive "$old_tty"; then
            die "refused: a live coordinator is recorded: $old_name on $old_tty"
        fi
        say "replaced a stale record: ${old_name:-an unreadable record}"
    fi
    jq -n --arg n "$name" --arg t "$tty" --arg s "$(now)" '{name:$n, tty:$t, started:$s}' | write_atomic "$RECORD"
    echo "registered $name"
}

cmd_clear() {
    [ $# -eq 0 ] || die "clear: unexpected argument $1"
    rm -f "$RECORD" || die "clear: cannot remove $RECORD"
}

cmd_lookup() {
    [ $# -eq 0 ] || die "lookup: unexpected argument $1"
    [ -f "$RECORD" ] || return 0
    local name tty
    name=$(jq -r '.name // ""' "$RECORD" 2>/dev/null)
    tty=$(jq -r '.tty // ""' "$RECORD" 2>/dev/null)
    if [ -n "$name" ] && [ -n "$tty" ] && alive "$tty"; then
        echo "$name"
    else
        say "stale record: ${name:-an unreadable record} on ${tty:-no tty}"
    fi
}

cmd_declare() {
    local orch="" tty="" repo="" branch="" pr="" checkout="" heavy=""
    while [ $# -gt 0 ]; do
        [ $# -ge 2 ] || die "declare: $1 needs a value"
        case "$1" in
            --orchestrator) orch="$2" ;;
            --tty) tty="$2" ;;
            --repo) repo=$(abs_path "declare: --repo" "$2") || exit 1 ;;
            --branch) branch="$2" ;;
            --pr) pr="$2" ;;
            --checkout) checkout=$(abs_path "declare: --checkout" "$2") || exit 1 ;;
            --heavy) heavy="$2" ;;
            *) die "declare: unknown option $1" ;;
        esac
        shift 2
    done
    [ -n "$orch" ] && [ -n "$tty" ] && [ -n "$repo" ] \
        || die "declare: --orchestrator, --tty and --repo are required"
    [ -z "$pr" ] || printf '%s' "$pr" | grep -qE '^[0-9]+$' || die "declare: --pr must be a number: $pr"
    lock "refused: another declaration is running"
    # The next id is one above the highest in the file, never a count of its lines: a
    # ledger pruned by hand would otherwise hand out an id already given.
    local n=1
    if [ -s "$CLAIMS" ]; then
        n=$(jq -s '[.[].id | ltrimstr("c") | tonumber] | (max // 0) + 1' "$CLAIMS") \
            || die "declare: cannot read $CLAIMS"
    fi
    jq -nc --arg id "c$n" --arg o "$orch" --arg t "$tty" --arg r "$repo" --arg b "$branch" \
        --arg p "$pr" --arg c "$checkout" --arg h "$heavy" --arg at "$(now)" '
        def opt: if . == "" then null else . end;
        {id:$id, orchestrator:$o, tty:$t, repo:$r, branch:($b|opt),
         pr:(if $p == "" then null else ($p|tonumber) end), checkout:($c|opt), heavy:($h|opt),
         opened:$at, released:null}' >> "$CLAIMS" || die "declare: cannot append to $CLAIMS"
    echo "c$n"
}

# open_claim <id>: the open declaration with that id, one line of JSON, or nothing.
open_claim() {
    [ -f "$CLAIMS" ] || return 0
    jq -c --arg i "$1" 'select(.id == $i and .released == null)' "$CLAIMS"
}

cmd_release() {
    local id="${1:-}"
    [ -n "$id" ] && [ $# -eq 1 ] || die "release: usage: release <id>"
    lock "refused: another declaration is running"
    # Only an open declaration is closed: releasing one twice would move its closing time,
    # and the waiters it woke were woken by the first.
    [ -n "$(open_claim "$id")" ] || die "no open declaration $id"
    jq -c --arg i "$id" --arg at "$(now)" 'if .id == $i and .released == null then .released = $at else . end' \
        "$CLAIMS" | write_atomic "$CLAIMS"
}

cmd_conflicts() {
    local id="${1:-}"
    [ -n "$id" ] && [ $# -eq 1 ] || die "conflicts: usage: conflicts <id>"
    local mine
    mine=$(open_claim "$id")
    [ -n "$mine" ] || { say "no open declaration $id"; exit 2; }
    local found=0 oid otty oorch kind kinds
    # The other open declarations, one per line: id, tty, orchestrator, then the kinds of
    # overlap they share with this one, tab-separated.
    while IFS=$'\t' read -r oid otty oorch kinds; do
        [ -n "$oid" ] || continue
        # A claim whose orchestrator is gone blocks nobody: it is named so the coordinator
        # closes it, never counted as an overlap.
        if ! alive "$otty"; then
            echo "stale $oid $oorch"
            continue
        fi
        for kind in $kinds; do
            echo "overlap $kind $id $oid $oorch"
            found=1
        done
    done <<EOF
$(jq -r --argjson m "$mine" '
    select(.released == null and .id != $m.id)
    | [ .id, .tty, .orchestrator,
        ([ (if .branch != null and .repo == $m.repo and .branch == $m.branch then "branch" else empty end),
           (if .checkout != null and .checkout == $m.checkout then "checkout" else empty end),
           (if .pr != null and .repo == $m.repo and .pr == $m.pr then "pr" else empty end),
           (if .heavy != null and $m.heavy != null then "heavy" else empty end) ] | join(" ")) ]
    | @tsv' "$CLAIMS")
EOF

    # The facts, re-read now. A checkout this declaration names, already held by another
    # branch in the workspace list, is busy whatever the ledger says.
    local checkout branch
    checkout=$(jq -r '.checkout // ""' <<< "$mine")
    branch=$(jq -r '.branch // ""' <<< "$mine")
    if [ -n "$checkout" ] && [ -n "$branch" ]; then
        local want path held
        want=$( (cd "$checkout" 2>/dev/null && pwd -P) || printf '%s' "$checkout")
        while IFS='|' read -r path held _; do
            path=$(printf '%s' "$path" | sed 's/[[:space:]]*$//')
            held=$(printf '%s' "$held" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
            [ -n "$path" ] || continue
            [ "$( (cd "$path" 2>/dev/null && pwd -P) || printf '%s' "$path")" = "$want" ] || continue
            if [ "$held" != "$branch" ]; then
                echo "busy checkout $checkout"
                found=1
            fi
        done <<EOF
$(bash "$WORKSPACE" list 2>/dev/null)
EOF
    fi

    # The heavy runs the process table shows: the plugin's suite and plugin evaluation
    # runs. Said, never counted as a conflict: the coordinator weighs them itself. The
    # bracketed patterns keep this very pipeline from matching its own command line.
    ps -Ao pid=,command= 2>/dev/null | awk -v self=$$ '
        $1 != self && ($0 ~ /run-tests[.]sh/ || $0 ~ /plugin[ ]eval/) {
            pid = $1; sub(/^[ \t]*[0-9]+[ \t]+/, ""); print "running " pid " " $0
        }'

    [ "$found" = 0 ]
}

cmd="${1:-}"
[ -n "$cmd" ] || die "usage: coordinator.sh {register|clear|lookup|declare|release|conflicts} ... (see header)"
shift
case "$cmd" in
    register) cmd_register "$@" ;;
    clear) cmd_clear "$@" ;;
    lookup) cmd_lookup "$@" ;;
    declare) cmd_declare "$@" ;;
    release) cmd_release "$@" ;;
    conflicts) cmd_conflicts "$@" ;;
    *) die "unknown subcommand: $cmd (expected register, clear, lookup, declare, release or conflicts)" ;;
esac
