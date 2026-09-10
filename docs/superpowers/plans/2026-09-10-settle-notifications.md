# Settle Notifications Implementation Plan

> **For the orchestrator:** this plan is executed by implementer SESSIONS the orchestrator spawns (`orchestrator:iterm-agents`), one brief per task — never by subagents of the orchestrator's own session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One release, 0.22.2: a spawn — and every other command that mutates the layout — leaves no library traceback on stderr, because `run()` settles the app's notification tasks before the connection closes.

**Architecture:** one async helper `settle()` in `iterm_agent.py`, awaited by `run()` after the command's coroutine returns and before the library closes the socket. Three stub checks in the suite prove the mechanism without the app; one check in the live round reads the spawn's real stderr.

**Tech Stack:** Python 3 (the state directory's venv, 3.12), bash 3.2 for the suite.

**Spec:** `docs/design.md`, section 29. Section 14 (the tooling speaks the app's API) binds it.

## Global Constraints

Copied from `CLAUDE.md`; the task's requirements include them.

- **English only, everywhere.** **No vendor or product name in prose**; the runtime is "the host". Load-bearing identifiers exempt.
- **Commits**: Conventional Commits; no trailer, no attribution, no tool name, no session link.
- **`CLAUDE.md` and `.claude/` are never committed.**
- **Before pushing**: `./tests/run-tests.sh` passes (197 on the base head; this task adds 3); the brand grep returns only exempt occurrences; no accented character outside `docs/`.
- **Release** (spec §8): version in `plugin.json` and both fields of `marketplace.json`: `0.22.2`.
- **Never run anything against the live app from the suite.** Dry runs and stubs only. The live round (`tests/e2e.sh`) is the orchestrator's to run; it gains one check here that the implementer writes but does not run.
- **Every command runs synchronously**, in the tool call that waits for it; the suite is piped to `tail` in the same call.
- **Branches**: created with `git switch -c <name> <base> --no-track`, never `git checkout -b X origin/Y` (the tracking write fails in the sandbox and leaves HEAD behind).

---

### Task 1: A spawn settles the app's notifications before it hangs up (0.22.2)

**Files:**
- Modify: `skills/iterm-agents/scripts/iterm_agent.py` — a module constant `HELPER_DISPATCH` and an async helper `settle(tries=20)` placed immediately above `def run(coro_fn):`; one added line in `run()`'s inner `main`.
- Modify: `tests/run-tests.sh` — three checks appended at the END of the section « the app, stubbed », immediately before the line `echo "== tap =="`; they reuse the `py` variable that section defines.
- Modify: `tests/e2e.sh` — one check immediately after the check `spawn returns a tty` and its `[ -n "$TTY" ] || exit 1` line.
- Modify: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — `0.22.2`.
- Commit (already in the worktree, written by the orchestrator): `docs/design.md` section 29, and this plan file.

**Interfaces:**
- Consumes: `asyncio.all_tasks()`, `asyncio.current_task()`, `Task.get_coro().__qualname__` — the library's helper dispatch coroutine is `Connection._async_dispatch_to_helper`, its dispatcher `Connection._async_dispatch_forever` (both in the installed library's `connection.py`; the dispatcher never ends and must never be awaited).
- Produces: `HELPER_DISPATCH = "_async_dispatch_to_helper"`. `async def settle(tries=20) -> None` — on each pass, gathers with `return_exceptions=True` every task that is not the caller, not done, and whose coroutine `__qualname__` ends with `HELPER_DISPATCH`; returns as soon as a pass finds none pending, or after `tries` passes; awaits no other task. `run(coro_fn)` — unchanged signature and return; its inner `main` awaits `settle()` after `coro_fn` and before returning.

- [ ] **Step 1: Write the failing checks**

In `tests/run-tests.sh`, immediately before the line `echo "== tap =="`, insert:

```bash
# The library dispatches every notification as a task of its own and, when the command's
# coroutine returns, cancels those tasks without awaiting them and closes the socket: the
# ones mid-flight die on it, and the loop reports each one at exit (§29). settle() awaits
# them while the socket is open. The stub is a connection whose helper fails and whose
# dispatcher never ends; the control below is the same stub without the settle, so the
# first check reads the mechanism and not the absence of a warning.
SETTLE='
import asyncio, gc, sys
sys.path.insert(0, sys.argv[1])
import iterm_agent as ia
class Connection:
    async def _async_dispatch_to_helper(self, message):
        await asyncio.sleep(0)
        raise RuntimeError("closed under " + str(message))
    async def _async_dispatch_forever(self):
        while True:
            await asyncio.sleep(3600)
async def main(settle):
    c = Connection()
    forever = asyncio.ensure_future(c._async_dispatch_forever())
    asyncio.ensure_future(c._async_dispatch_to_helper(1))
    asyncio.ensure_future(c._async_dispatch_to_helper(2))
    if settle:
        await asyncio.wait_for(ia.settle(), 5)
    else:
        await asyncio.sleep(0.05)
    forever.cancel()
    print("settled")
asyncio.run(main(sys.argv[2] == "settle"))
gc.collect()
'
settle_out=$("$py" -c "$SETTLE" "$ROOT/skills/iterm-agents/scripts" settle 2>&1)
check "settle awaits the helpers, retrieves their exceptions, and returns with the dispatcher running" "settled|0" \
  "$(printf '%s|%s' "$(printf '%s' "$settle_out" | head -1)" "$(printf '%s' "$settle_out" | grep -c 'never retrieved')")"
check "the control without settle is reported at exit (the check reads the mechanism)" "1" \
  "$("$py" -c "$SETTLE" "$ROOT/skills/iterm-agents/scripts" none 2>&1 | grep -c 'never retrieved' | awk '{print ($1>0)}')"
check "run() settles before handing the connection back" "1" \
  "$(grep -c '^        await settle()$' "$ROOT/skills/iterm-agents/scripts/iterm_agent.py")"
```

- [ ] **Step 2: Run the suite and watch the new checks fail for the right reason**

```bash
./tests/run-tests.sh 2>&1 | tail -3
```

Expected: `198 passed, 2 failed`. The first check's actual value starts with a traceback line (no `settle` attribute on the module) and the third reads `0`; the control passes already — it reads the library's behaviour, not ours. Report the three actual values verbatim before editing anything.

- [ ] **Step 3: Implement**

In `skills/iterm-agents/scripts/iterm_agent.py`, immediately above `def run(coro_fn):`, insert:

```python
HELPER_DISPATCH = "_async_dispatch_to_helper"


async def settle(tries=20):
    """Let the library's notification tasks finish while the connection is still open.

    A mutation — a tab created, a session closed — makes the app send layout and focus
    notifications, and the library dispatches each one as a task of its own. When the
    command's coroutine returns, the library cancels those tasks without awaiting them
    and closes the socket; the ones mid-flight die on it, and the loop reports every one
    at exit as an exception nobody retrieved — four tracebacks per spawn, on a spawn that
    succeeded (§29). Awaiting them here, socket open, is the whole fix. The dispatcher's
    own task never ends and is not awaited; the bound is for a storm, the normal case
    settles on the first pass."""
    me = asyncio.current_task()
    for _ in range(tries):
        pending = [t for t in asyncio.all_tasks()
                   if t is not me and not t.done()
                   and getattr(t.get_coro(), "__qualname__", "").endswith(HELPER_DISPATCH)]
        if not pending:
            return
        await asyncio.gather(*pending, return_exceptions=True)
```

In `run()`, the inner `main` becomes exactly:

```python
    async def main(connection):
        result["value"] = await coro_fn(iterm2, connection)
        await settle()
```

Nothing else in `run()` changes. No other function changes.

- [ ] **Step 4: Run the suite**

```bash
./tests/run-tests.sh 2>&1 | tail -3
```

Expected: `200 passed, 0 failed`.

- [ ] **Step 5: The live check (written, not run)**

In `tests/e2e.sh`, immediately after the line `[ -n "$TTY" ] || exit 1` that follows the check `spawn returns a tty`, insert:

```bash
# Four library tracebacks used to follow every successful spawn: notification tasks dying
# on the closed socket (§29). A stderr that is noisy on success is one nobody reads on
# failure. spawn_out keeps stderr, so this reads the real thing.
check "the spawn's stderr carries no library traceback" "0" \
  "$(printf '%s' "$spawn_out" | grep -c 'Task exception was never retrieved')"
```

Do not run `tests/e2e.sh`; the orchestrator runs it on the pinned head.

- [ ] **Step 6: Version**

`.claude-plugin/plugin.json` `version` and both `version` fields of `.claude-plugin/marketplace.json`: `0.22.2`. Then `./tests/run-tests.sh 2>&1 | tail -1` again: `200 passed, 0 failed`.

- [ ] **Step 7: Commit and deliver**

Two commits, in this order, with these exact subjects:

1. `docs(design): a spawn settles the app's notifications before it hangs up` — `docs/design.md` and `docs/superpowers/plans/2026-09-10-settle-notifications.md`, as found in the worktree.
2. `fix(iterm-agents): settle the app's notification tasks before the connection closes` — `iterm_agent.py`, `tests/run-tests.sh`, `tests/e2e.sh`, the two version files. Body: why (the library cancels its helper tasks without awaiting them; the ones the tab creation put in flight die on the closed socket and are reported at exit; a noisy stderr on success is one nobody reads on failure).

Push the branch, open the draft PR as the brief says.
