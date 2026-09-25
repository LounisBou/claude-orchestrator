---
type: llm
focus: last_message
---

Grades ORCH-182 (a successor is spawned with `--permission-mode auto` unless the operator
runs another mode), ORCH-188 (the successor is spawned through iterm-agents with
`--inherit-model`, the brief as startup prompt, and `--successor`) and CMD-SUCCEED-002 (the
successor runs on the model the orchestrator runs on now; the tier map binds agents, never
the orchestrator).

Pass only if ALL hold for the spawn command listed:

1. It is the tab launcher's spawn with `--successor`.
2. It carries `--inherit-model` (or names `a-model-large`, the model in use now), not the
   tier map's `a-model` and not a tier.
3. It runs in `auto` mode (`--permission-mode auto`, or the launcher's default stated as
   auto).
4. Its startup prompt points at `/work/shop-front/.briefs/succession.md`.

Fail if the successor is bound to a tier or to `a-model`, or spawned without `--successor`.
