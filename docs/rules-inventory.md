# Rules inventory

A working file: every rule the plugin's markdown directives state, one row per atomic
rule, so that each one can be kept, merged, moved or dropped on purpose while the
directives are rewritten. `tests/rules-trace.sh` checks it mechanically.

- **Base commit:** `c5c968f` (0.34.0); line numbers cite the sources as they stand there.
- **Date:** 2026-09-25.
- **Sources:** `skills/*/SKILL.md`, `commands/*.md`, `templates/*.md`, `README.md`,
  `docs/design.md`.

## Columns

| Column | Content |
|---|---|
| `id` | `<FAMILY>-<NNN>`, unique, zero-padded |
| `rule` | one normative sentence, reworded without loss of meaning; a literal pipe is written `\|` |
| `sources` | every repo-relative `path:line` where the rule appears, comma-separated |
| `kind` | `rule` · `procedure` · `fact` · `rationale` |
| `criticality` | `critical` (a violation breaks a session or costs hours; every rule behind an « Observed » incident) · `normal` |
| `enforced-by` | `prose` · `script:<path>` (an existing lint, gate or test) · `eval` |
| `fate` | `keep` · `merge-><id>` · `move-><path>` · `drop?` · `contradiction?` · `script-candidate?` — a trailing `?` is a proposal awaiting the operator's ruling |
| `target` | repo-relative path where the rule lives now |
| `signature` | a literal excerpt of at least six words, found once by a fixed-string search in `target`; never holds a pipe |

A `rationale` row carries the narrative behind a rule and names that rule's id at the
start of its `rule` cell: « rationale of ORCH-042: … ».

## Id prefixes

| Prefix | Source family |
|---|---|
| `ORCH` | `skills/orchestrator/SKILL.md` |
| `ITERM` | `skills/iterm-agents/SKILL.md` |
| `ROUTE` | `skills/model-routing/SKILL.md` |
| `GAUGE` | `skills/context-gauge/SKILL.md` |
| `TPL-<name>` | `templates/<name>.md` |
| `CMD-<name>` | `commands/<name>.md` |
| `README` | `README.md` |
| `DESIGN` | `docs/design.md` |

## Checking it

```bash
tests/rules-trace.sh sources docs/rules-inventory.md --ref <commit>   # every cited line exists
tests/rules-trace.sh targets docs/rules-inventory.md                  # every kept rule is found
```
