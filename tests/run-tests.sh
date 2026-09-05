#!/bin/bash
# Test suite. No network, no terminal automation, isolated HOME per case.
#
# Each case runs a script against a temporary state directory or a temporary
# HOME and compares its output or its side effects with an expected value.

set -u

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0

# check <name> <expected> <actual>
check() {
  if [ "$2" = "$3" ]; then
    printf '  ok   %s\n' "$1"
    pass=$((pass + 1))
  else
    printf '  FAIL %s\n' "$1"
    printf '       expected: %s\n' "$(printf '%s' "$2" | tr '\n' '⏎')"
    printf '       actual:   %s\n' "$(printf '%s' "$3" | tr '\n' '⏎')"
    fail=$((fail + 1))
  fi
}

# check_status <name> <expected-exit-code> <command...>
check_status() {
  local name="$1" expected="$2"
  shift 2
  "$@" >/dev/null 2>&1
  local code=$?
  check "$name" "exit $expected" "exit $code"
}

echo "== repository policy =="

# The product name appears only in load-bearing identifiers: host paths, host
# environment variables, the plugin name and the manifest directory.
hits=$(grep -rniI 'claude' "$ROOT" --exclude-dir=.git --exclude=plan.md --exclude=CLAUDE.md \
  | grep -viE '~/\.claude/|\$HOME/\.claude|CLAUDE_CONFIG_DIR|CLAUDE_PLUGIN_ROOT|CLAUDE_CODE_SESSION_ID|ORCHESTRATOR_HOST_CLI:-claude|claude-orchestrator|\.claude-plugin|/\.claude/' || true)
check "no product name in prose" "" "$hits"

# Nothing tied to one machine or one project enters the generic plugin: no
# absolute home path, no real session reference (the documented example is
# the six-hex placeholder a1b2c3), no path into a downstream project's tree.
hits=$(grep -rnIE '/Users/|/home/[a-z]|\[[0-9a-f]{6}\]|docs/reference/|BUGS\.md|IMPLEMENTATION\.md' "$ROOT" --exclude-dir=.git --exclude=plan.md --exclude=run-tests.sh \
  | grep -vE '\[a1b2c3\]' || true)
check "nothing project- or machine-specific in the plugin" "" "$hits"

echo "== tap =="

TAP="$ROOT/skills/context-gauge/scripts/statusline-tap.sh"
# The payload shape is the one the host actually sends: context_window carries
# used_percentage, context_window_size and a current_usage breakdown.
PAYLOAD='{"session_id":"s-1","transcript_path":"/t/s-1.jsonl","context_window":{"used_percentage":36.4,"context_window_size":250000,"current_usage":{"input_tokens":1000,"cache_creation_input_tokens":2000,"cache_read_input_tokens":88000}},"rate_limits":{"five_hour":{"used_percentage":3,"resets_at":1788560000},"seven_day":{"used_percentage":1,"resets_at":1788900000}}}'
STATE="$WORK/state"

out=$(printf '%s' "$PAYLOAD" | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP")
check "no wrapped command: one-line render" "ctx: 36% │ 5h: 3% │ 7d: 1%" "$out"
check "file written with every field" \
  '{"session_id":"s-1","context_percent":36.4,"context_used":91000,"context_total":250000,"five_hour_percent":3,"five_hour_resets_at":1788560000,"seven_day_percent":1,"seven_day_resets_at":1788900000,"transcript_path":"/t/s-1.jsonl"}' \
  "$(jq -c 'del(.updated_epoch)' "$STATE/ctx/s-1.json")"
out=$(printf '{"session_id":"s-early","context_window":{"used_percentage":0}}' | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP")
check "early payload without usage or transcript: nulls, no crash" \
  '{"session_id":"s-early","context_percent":0,"context_used":null,"context_total":null,"five_hour_percent":null,"five_hour_resets_at":null,"seven_day_percent":null,"seven_day_resets_at":null,"transcript_path":null}' \
  "$(jq -c 'del(.updated_epoch)' "$STATE/ctx/s-early.json")"
age=$(( $(date +%s) - $(jq '.updated_epoch' "$STATE/ctx/s-1.json") ))
check "updated_epoch is now" "recent" "$([ "$age" -lt 5 ] && echo recent || echo "$age s old")"

cat > "$WORK/echo.sh" <<'EOF'
#!/bin/bash
cat
exit 3
EOF
chmod +x "$WORK/echo.sh"
out=$(printf '%s' "$PAYLOAD" | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP" "$WORK/echo.sh")
code=$?
check "payload passed byte-for-byte to the wrapped command" "$PAYLOAD" "$out"
check "wrapped command's exit status returned" "3" "$code"

out=$(printf 'not json' | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP" "$WORK/echo.sh")
check "invalid stdin still reaches the wrapped command" "not json" "$out"
check "invalid stdin writes no file" "2" "$(ls "$STATE/ctx" | wc -l | tr -d ' ')"
out=$(printf '' | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP")
check "empty stdin renders a placeholder" "ctx: ~ │ 5h: ~ │ 7d: ~" "$out"

touch -t 202001010000 "$STATE/ctx/old.json"
printf '%s' "$PAYLOAD" | sed 's/s-1/s-2/' | ORCHESTRATOR_STATE_DIR="$STATE" bash "$TAP" >/dev/null
check "stale files pruned on a session's first render" "gone" "$([ -f "$STATE/ctx/old.json" ] && echo kept || echo gone)"

echo "== gauge =="

GAUGE="$ROOT/skills/context-gauge/scripts/context-gauge.sh"
GSTATE="$WORK/gstate"
mkdir -p "$GSTATE/ctx" "$WORK/projects/p1"
cp "$ROOT/tests/fixtures/transcript.jsonl" "$WORK/projects/p1/g-1.jsonl"
printf '{"session_id":"g-1","context_percent":36.4,"context_used":91000,"context_total":250000,"five_hour_percent":3,"five_hour_resets_at":null,"seven_day_percent":1,"seven_day_resets_at":null,"transcript_path":null,"updated_epoch":%s}\n' \
  "$(date +%s)" > "$GSTATE/ctx/g-1.json"
gauge() { ORCHESTRATOR_STATE_DIR="$GSTATE" ORCHESTRATOR_TRANSCRIPTS_DIR="$WORK/projects" bash "$GAUGE" "$@"; }

# g-2 has no transcript under the projects directory: only the path recorded in
# its stale tap file can lead to it.
printf '{"session_id":"g-2","context_percent":36.4,"context_used":91000,"context_total":250000,"five_hour_percent":null,"five_hour_resets_at":null,"seven_day_percent":null,"seven_day_resets_at":null,"transcript_path":"%s","updated_epoch":0}\n' \
  "$WORK/projects/p1/g-1.jsonl" > "$GSTATE/ctx/g-2.json"
check "stale tap file: transcript found through its recorded path" "context_percent=36.0
context_tokens=90000
context_window=250000
context_window_source=tap-file
source=transcript" "$(gauge g-2)"

check "fresh tap file wins" "context_percent=36.4
context_tokens=91000
context_window=250000
five_hour_percent=3
seven_day_percent=1
source=tap" "$(gauge g-1)"

check "stale tap file: transcript with the file's window" "context_percent=36.0
context_tokens=90000
context_window=250000
context_window_source=tap-file
source=transcript" "$(gauge g-1 --max-age 0)"

rm "$GSTATE/ctx/g-1.json"
check "no tap file: --window" "context_percent=45.0
context_tokens=90000
context_window=200000
context_window_source=flag
source=transcript" "$(gauge g-1 --window 200000)"

check "session id from the environment, default window" "context_window_source=default" \
  "$(CLAUDE_CODE_SESSION_ID=g-1 gauge | grep context_window_source)"
check "assumed window carries a warning line" "1" "$(CLAUDE_CODE_SESSION_ID=g-1 gauge | grep -c '^warning=window assumed')"
check "known window carries no warning" "0" "$(gauge g-1 --window 200000 | grep -c '^warning=')"

check_status "nothing readable exits 1" 1 gauge nope
check_status "no session id exits 1" 1 env -u CLAUDE_CODE_SESSION_ID ORCHESTRATOR_STATE_DIR="$GSTATE" bash "$GAUGE"

echo "== install =="

H="$WORK/home"
mkdir -p "$H/.claude"
TAPDEST="$H/.claude/claude-orchestrator/statusline-tap.sh"
printf '{"statusLine":{"type":"command","command":"/x/bar.sh","padding":0},"other":1}\n' > "$H/.claude/settings.json"
env HOME="$H" bash "$ROOT/install.sh" >/dev/null 2>&1
check "existing command wrapped" "$TAPDEST /x/bar.sh" "$(jq -r '.statusLine.command' "$H/.claude/settings.json")"
check "other settings untouched" "1" "$(jq '.other' "$H/.claude/settings.json")"
check "previous statusLine saved" '{"type":"command","command":"/x/bar.sh","padding":0}' \
  "$(jq -c . "$H/.claude/claude-orchestrator/statusline.previous.json")"
check "tap copied and executable" "yes" "$([ -x "$TAPDEST" ] && echo yes || echo no)"
before=$(cat "$H/.claude/settings.json")
env HOME="$H" bash "$ROOT/install.sh" >/dev/null 2>&1
check "second run is a no-op" "$before" "$(cat "$H/.claude/settings.json")"
env HOME="$H" bash "$ROOT/uninstall.sh" >/dev/null 2>&1
check "uninstall restores the previous object" '{"type":"command","command":"/x/bar.sh","padding":0}' \
  "$(jq -c '.statusLine' "$H/.claude/settings.json")"
check "uninstall removes the state directory" "gone" "$([ -d "$H/.claude/claude-orchestrator" ] && echo kept || echo gone)"

H2="$WORK/home2"
mkdir -p "$H2/.claude"
printf '{}\n' > "$H2/.claude/settings.json"
env HOME="$H2" bash "$ROOT/install.sh" >/dev/null 2>&1
check "no statusLine: tap alone" "$H2/.claude/claude-orchestrator/statusline-tap.sh" \
  "$(jq -r '.statusLine.command' "$H2/.claude/settings.json")"
env HOME="$H2" bash "$ROOT/uninstall.sh" >/dev/null 2>&1
check "uninstall deletes the key it created" "null" "$(jq '.statusLine' "$H2/.claude/settings.json")"

H3="$WORK/home3"
mkdir -p "$H3/.claude"
printf '{"statusLine":{"type":"command","command":"/x/bar.sh"}}\n' > "$H3/.claude/settings.json"
env HOME="$H3" bash "$ROOT/install.sh" --dry-run >/dev/null 2>&1
check "dry-run changes nothing" "/x/bar.sh" "$(jq -r '.statusLine.command' "$H3/.claude/settings.json")"
check "dry-run creates no state directory" "none" "$([ -d "$H3/.claude/claude-orchestrator" ] && echo created || echo none)"

echo "== iterm script (argument validation, no automation) =="

ITERM="$ROOT/skills/iterm-agents/scripts/iterm-agent.sh"
check_status "close without --tty fails" 1 bash "$ITERM" close --expect-title x
check_status "move with identical ttys fails" 1 bash "$ITERM" move --tty /dev/ttys000 --left-of /dev/ttys000
check_status "spawn without --dir fails" 1 bash "$ITERM" spawn --title x
check_status "unknown subcommand fails" 1 bash "$ITERM" bogus
check "close error names the option" "ERROR: close: --tty is required" "$(bash "$ITERM" close 2>&1)"

echo
printf '%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
