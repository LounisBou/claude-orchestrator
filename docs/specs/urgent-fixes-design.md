# Urgent fixes — design

## Why

The plugin's refactoring now happens in `LounisBou/claude-plugins` (`docs/specs/program-design.md`
there), where this repository's history is imported. This repository is frozen except for the
fixes the operator needs before that refactoring lands: defects that break today's work, and
security risks. Each fix merged here is imported into the monorepo the same day.

## Goals

1. The stop gate checks every release again: `idle-delivered` and `idle-agents` no longer return before the done, tool-wait and malformed-line checks.
2. The liveness reads agree: `readSessions` passes a process table, not a set, and `paneIsOpen` applies the rule `runsLive` applies.
3. A failed measure never republishes the previous reading as current.
4. The coordinator's collision lines are correct under every awk.
5. The launcher accepts only an allowlisted permission mode and refuses `bypassPermissions`.
6. The trust-file write is locked, uses a unique temporary name, keeps a backup and lands in one rename.
7. The branches in flight are merged or closed, and no new rulebook-condensing branch is opened.

## Defects (line numbers at 0.98.0)

- G1: `hooks/stop-gate.ts:470-474` and `:491`; `hooks/tests/stop-gate.test.ts:1738` pins the
  wrong order and is the test this spec names to change.
- G2: `hooks/supervision.ts:497`, `hooks/commands.ts:83,185`; `hooks/supervision.ts:857-866`.
- G3: `hooks/gauge.ts`, catch path; `supervision.ts:1158` reads `currentIn` without checking
  the session id.
- G4: `skills/coordinator/scripts/coordinator.sh:961,963`: `l[k] = (k in l) ? …` evaluates
  after `l[k]` exists under mawk; build the joined value in a separate variable.
- G5: `skills/iterm-agents/scripts/iterm_agent.py:4091,3941`; allowed modes: `default`,
  `acceptEdits`, `plan`, `auto`, and the modes the operator's current spawn rules use.
- G6: `skills/iterm-agents/scripts/iterm_agent.py:4032-4052`.

## Constraints

- Nothing that works today changes for the operator: no new prompt, no new step, the spawn
  rule and the trust write kept.
- Each fix lands with the test that fails when it is reverted.
- Smallest change that fixes the defect: no restructuring, no port, no prompt condensing.
  Those are the monorepo's.

## Non-goals (the monorepo's program owns them)

1. Prompt and rulebook condensing beyond the branches already in flight.
2. Strict TypeScript, the state store, `declare_wait`, ports of bash to TypeScript.
3. `withDeadline` cancellation, temporary-file sweeping, test portability on Linux.
4. The push guard's removal, `routing.py`'s reduction, outcome evals, the method kernel.
