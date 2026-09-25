#!/bin/bash
# rules-trace.sh — prove that no rule of the inventory vanished silently.
#
#   rules-trace.sh sources <inventory> [--ref <git-ref>]
#   rules-trace.sh targets <inventory>
#
# sources: every 'path:line' of every row exists at <ref> (default HEAD): the file is
#          present at that commit and the line is within its length.
# targets: every row whose fate is keep, merge-> or move-> has its signature found by a
#          fixed-string search in its target, in the working tree, exactly once. Rows
#          awaiting a ruling (a fate ending in '?') are skipped.
#
# Paths are relative to the root of the repository the command runs in. Prints one line
# per failing row, '<id> <reason> <target>', then 'ok=<n> missing=<n> skipped=<n>'.
# Exits 0 when missing=0, 1 otherwise, 2 on a usage error or an unreadable inventory.
#
# Why it exists: the directives are rewritten phase after phase, and a rule deleted in a
# rewrite leaves no trace a reviewer can see. The inventory names each rule with a literal
# excerpt of its target; this makes "every rule is still somewhere" a command, not a claim.
# The excerpt must be unique in its target and at least six words long, or a generic
# phrase would keep matching elsewhere after the rule itself is gone.

set -uo pipefail

usage="usage: rules-trace.sh sources <inventory> [--ref <git-ref>] | rules-trace.sh targets <inventory>"
fail_usage() { echo "rules-trace: $1 ($usage)" >&2; exit 2; }

mode="${1:-}"
inventory="${2:-}"
ref="HEAD"
case "$mode" in
    sources|targets) ;;
    *) fail_usage "unknown or missing mode" ;;
esac
[ -n "$inventory" ] || fail_usage "missing inventory"
shift 2
while [ $# -gt 0 ]; do
    case "$1" in
        --ref)
            [ "$mode" = sources ] || fail_usage "--ref applies to sources only"
            [ -n "${2:-}" ] || fail_usage "--ref needs a value"
            ref="$2"
            shift 2
            ;;
        *) fail_usage "unexpected argument: $1" ;;
    esac
done
[ -f "$inventory" ] && [ -r "$inventory" ] || { echo "rules-trace: cannot read inventory: $inventory" >&2; exit 2; }

root=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
if [ "$mode" = sources ]; then
    git -C "$root" rev-parse --verify -q "$ref^{commit}" >/dev/null \
        || { echo "rules-trace: unknown git ref: $ref" >&2; exit 2; }
fi

# One tab-separated record per inventory row: id, sources, fate, target, signature, and the
# row's cell count. A row is a table line whose first cell is an id; an escaped '\|' is
# folded to a placeholder before splitting, so it never opens a new cell.
rows() {
    awk '
        /^\|[ \t]*[A-Z][A-Z0-9-]*-[0-9][0-9][0-9][ \t]*\|/ {
            line = $0
            gsub(/\\\|/, "\037", line)
            n = split(line, cell, "|")
            for (i = 1; i <= n; i++) {
                gsub(/^[ \t]+|[ \t]+$/, "", cell[i])
                gsub("\037", "|", cell[i])
            }
            # A well-formed row splits into nine cells between an empty first and last.
            printf "%s\t%s\t%s\t%s\t%s\t%d\n", cell[2], cell[4], cell[8], cell[9], cell[10], n - 2
        }
    ' "$inventory"
}

ok=0; missing=0; skipped=0
report() { printf '%s %s %s\n' "$1" "$2" "$3"; missing=$((missing + 1)); }

# Line count of <path> at <ref>, or nothing when the file is absent there. awk counts a
# last line that carries no newline, which 'wc -l' would not.
lines_at() {
    git -C "$root" cat-file -e "$ref:$1" 2>/dev/null || return 1
    git -C "$root" show "$ref:$1" | awk 'END { print NR }'
}

while IFS=$'\t' read -r id sources fate target signature cells; do
    if [ "$cells" != 9 ]; then
        report "$id" "malformed-row:$cells-cells" "${target:--}"
        continue
    fi

    if [ "$mode" = sources ]; then
        bad=""
        [ -n "$sources" ] || bad="no-sources"
        IFS=',' read -ra refs <<< "$sources"
        for s in ${refs[@]+"${refs[@]}"}; do
            s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"
            [ -n "$s" ] || continue
            path="${s%:*}"; line="${s##*:}"
            if [ "$path" = "$s" ] || ! [[ "$line" =~ ^[1-9][0-9]*$ ]]; then
                bad="${bad:+$bad,}bad-source:$s"
            elif ! len=$(lines_at "$path"); then
                bad="${bad:+$bad,}no-file:$s"
            elif [ "$line" -gt "$len" ]; then
                bad="${bad:+$bad,}past-end:$s"
            fi
        done
        if [ -n "$bad" ]; then report "$id" "$bad" "$target"; else ok=$((ok + 1)); fi
        continue
    fi

    case "$fate" in
        keep|merge-\>?*|move-\>?*) ;;
        *\?) skipped=$((skipped + 1)); continue ;;
        *) report "$id" "unknown-fate:$fate" "$target"; continue ;;
    esac
    if [ -z "$target" ] || [ ! -f "$root/$target" ]; then
        report "$id" "no-target" "${target:--}"
        continue
    fi
    if [ "$(printf '%s\n' "$signature" | wc -w | tr -d ' ')" -lt 6 ]; then
        report "$id" "short-signature" "$target"
        continue
    fi
    # Occurrences, not matching lines: the same excerpt twice on one line is not unique.
    count=$(grep -oF -e "$signature" "$root/$target" | wc -l | tr -d ' ')
    case "$count" in
        1) ok=$((ok + 1)) ;;
        0) report "$id" "absent" "$target" ;;
        *) report "$id" "not-unique:$count" "$target" ;;
    esac
done < <(rows)

echo "ok=$ok missing=$missing skipped=$skipped"
[ "$missing" -eq 0 ]
