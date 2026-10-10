#!/bin/bash
# A headless-host stub. Agent runs edit hello.sh by effort; judge runs answer from STUB_JUDGE.
model=""; effort=""; mode=""
while [ $# -gt 0 ]; do
  case "$1" in
    --model) model="$2"; shift 2 ;;
    --effort) effort="$2"; shift 2 ;;
    --permission-mode) mode="$2"; shift 2 ;;
    *) shift ;;
  esac
done
prompt=$(cat)
usage() { printf '{"type":"result","subtype":"%s","is_error":%s,"result":%s,"modelUsage":{"%s-1":{"costUSD":%s}}}\n' "$1" "$2" "$3" "$model" "$4"; }
if printf '%s' "$prompt" | grep -q 'JUDGE-RUBRIC'; then
  case "${STUB_JUDGE:-pass}" in
    pass) usage success false '"{\"verdict\":\"pass\",\"scores\":{\"scope\":5},\"reasons\":[]}"' 0.02 ;;
    fail) usage success false '"{\"verdict\":\"fail\",\"scores\":{\"scope\":1},\"reasons\":[\"off scope\"]}"' 0.02 ;;
    *) usage success false '"not json at all"' 0.02 ;;
  esac
  exit 0
fi
git log --all --oneline 2>/dev/null | wc -l | tr -d ' ' > .reachable-commits
[ -n "${STUB_MERGED:-}" ] && { git cat-file -e "$STUB_MERGED" 2>/dev/null && echo yes || echo no; } > .merged-reachable
printf '%s\n' "$mode" > .permission-mode
case "$effort" in
  max) usage error_max_budget_usd true '""' 0.40; exit 0 ;;
  low) printf '#!/bin/bash\necho hello\n' > hello.sh ;;
  *) printf '#!/bin/bash\necho hello world\n' > hello.sh ;;
esac
usage success false '"done"' 0.10
