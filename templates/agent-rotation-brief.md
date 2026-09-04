# {{PROJECT}} — resume brief for Phase {{PHASE_NUMBER}}: {{PHASE_TITLE}}

You replace a previous implementer whose context grew too large. Its work is on the branch; nothing you need lives in its memory. Read §1, verify §2, then continue from §3.

## 1. Required reading

The phase brief `{{PHASE_BRIEF}}` stays binding in full — reading list, environment, scope, method, forbidden list, protocol, delivery. This brief only adds state.

## 2. State — verify, do not believe

- Branch `{{BRANCH}}`, expected head `{{HEAD}}`: run `git log --oneline -5` and `git status --short`.
- Landed: {{LANDED}}
- In flight (uncommitted or unpushed — check the working tree): {{IN_FLIGHT}}
- Last gate result: {{LAST_GATE}}

## 3. Remaining scope

{{REMAINING}}

## 4. Decisions already taken — NOT reopenable

{{DECISIONS}}

## 5. Protocol

Unchanged from the phase brief: report to the orchestrator `{{ORCHESTRATOR_NAME_PATTERN}}` on start (with your measured context from `${CLAUDE_PLUGIN_ROOT}/skills/context-gauge/scripts/context-gauge.sh`), on each push, on any blocker, and at the end. STOP-and-ask for anything outside §3.
