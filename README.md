# claude-orchestrator

One session supervises implementer sessions instead of writing code itself:
it writes their briefs, reviews every delivery on the artifact rather than on
the report, rotates saturated agents, and hands over to a successor before its
own judgment degrades. This plugin packages that method, the terminal tab
tooling it needs on macOS, the briefs as templates, and a context gauge any
session can read without depending on a particular status bar.

## What you get

| Piece | What it does |
|---|---|
| skill `orchestrator` | The rulebook: phase and PR rules, the agent prompt recipe, the agents' lifecycle (the orchestrator launches, verifies, controls, terminates and replaces them), review on evidence, review rounds run in disposable sessions, what a round costs and the three ways to shorten it, context rotation, the orchestrator's own succession, shared-machine discipline. Its `workspace.sh` makes a clone per phase (`create`) and a pinned worktree per review round (`pin`, `--pr <n>` recording the pull request it reviews), deletes either together with the host's temporary directory it used (`delete`), and sweeps the leftovers whose pull request is merged or closed (`sweep`) — never a dirty tree, unpushed commits, a pin whose head is on no branch, or a directory a live process works in. |
| skill `iterm-agents` | `list`, `spawn`, `verify`, `resolve-tier`, `close`, `move`, `rotate` iTerm2 tabs running agent sessions, through the app's own API rather than by typing into a shell. Placement anchors on a tty or on `self` — after the caller's last open agent, so a window reads as launch order. The prompt goes to a file and the typed command stays short; the tab runs the launch through the operator's login shell, so the agent inherits the full PATH; spawn waits for the host CLI on the new tty and fails loudly otherwise; tty-exact close with a title guard, which also deletes the stood-down session's checkout once its process is proved gone (`--keep-checkout` opts out); spawn-and-verify before close on rotate. |
| skill `model-routing` | Which capability tier a dispatch gets: pay for judgment nothing downstream re-checks. A table by class of work, five readings for the cases off the table, escalation as a rotation, and the false-economy rule. |
| skill `coordination` | The coordinator's role, outside every orchestration on one machine: answers from the facts, flags collisions to both sides, gates nothing, relays to the operator what is his. The orchestrator's and the auditor's skills say nothing of it. |
| `templates/` | Phase brief, rotation resume brief, orchestrator succession brief, review-agent brief, comments-agent brief, audit brief, with the sections the rulebook makes mandatory. |
| script `rhythm.sh` | An audit's net balance read from git alone: merges per week by conventional-commit type, and lines added and removed under product globs against instrument globs. |
| `/orchestrator:install` | Creates the state directory, unwires any tap a previous install left in front of your status line, and prunes what the tap left behind. Idempotent; refuses a host older than 2.1.287. |
| `/orchestrator:uninstall` | Restores the previous status line and removes the state directory. |
| `/orchestrator:status` | Live sessions and their context fill, the ones past the gate flagged. |
| `/orchestrator:supervision` | Opens the supervision pane, the live sessions and their fill kept on screen — in a coordinator session (`Coord :`) only, and only when typed: no session opens it on its own. |
| `/orchestrator:succeed` | Runs the orchestrator succession. |
| module gate `prompt.submit` | The context gate enforced in-process by the hooks module: at or past 300,000 tokens (30 %) on a window of 1,000,000 tokens or more, the common case, and 80 % of a smaller window (`ORCHESTRATOR_CONTEXT_GATE`, `ORCHESTRATOR_CONTEXT_GATE_TOKENS`, `ORCHESTRATOR_LARGE_WINDOW`), every prompt of an orchestration session (named `Orch :`, `Agent :`, `Audit :` or `Coord :`) carries the line fitted to its role — succeed, or finish the unit and stop; unmeasured, it says so once. A session started by hand gets nothing. |
| module gate `tool.call` (Bash) | The push guard enforced in-process by the hooks module, in sessions the launcher spawned only: a `git push` that forces is refused unless its lease is pinned (`--force-with-lease=<branch>:<sha>`); the operator's own sessions are untouched. |
| hook `Stop` | The stop gate enforced in-process by the hooks module, in an orchestrator's session only (its name, launched or renamed, starts with `Orch :`): the stop is refused, at most once per turn, unless something will wake the orchestrator — a busy agent of its own, a blocking question declared on the message's last line (`waiting: operator — blocks: <what it blocks>`), or `waiting: done` with nothing left (no checkout, no agent, no open dispatch-record row). Then each watched pull request of the session's repository whose ci-watch log shows checks pending or failing refuses the stop once per head with the real state — one with a `ci-watch.sh` process alive for it excepted, since that watch will wake the orchestrator. When its checks let the stop pass, it also runs `workspace.sh sweep` within what is left of its deadline, at most once per ten minutes, and logs each deletion. Its own failures let the stop pass and are logged in the module's log. |
| `/orchestrator:agents` | Each running implementer agent's progress with its measured context — asked, then verified on the artifact. |
| `/orchestrator:progress` | Where the build stands: done, in flight, remaining, decisions pending, and the orchestrator's own context. |
| `/orchestrator:decide` | Runs a decision round with the user: every open question one at a time — context, choices with their cost, one recommendation — each ruling recorded and relayed before the next; a question is re-presented in full after any interruption. |
| `/orchestrator:audit` | Launches, on the operator's word, an audit of the method: a session in a tab titled `Audit : <subject>`, beside the caller, on its model and under remote control, in no chain. It reads the stock — what the method has in place, what it costs, what it has yielded — and the net balance of product against instruments, then writes one report of at most five proposals, each « remove X » or « restore Y » with its expected gain and the figure that will check it. It tells the operator and stops: it orders nothing, applies nothing and messages no session. The operator decides, and closes its tab. |
| `/orchestrator:coordinator` | Starts, on the operator's word and in a session he opened, the machine's coordinator, for when he runs several orchestrations at once: a session outside every one of them, in the leftmost tab, titled `Coord : <subject>`. It tells each orchestrator it exists and may be asked, and asks each once to confirm the pull requests the facts give it. It reads the sessions, checkouts, heavy runs and open pull requests now, answers « whose pull request is this », « is anyone on this branch or file », « may I or must I wait » from them, flags a collision to both sides, relays to the operator what is his, carries his orders to all, and gates nothing. At the gate it hands over to its own successor. |
| `/orchestrator:coordinator-end` | Ends the coordinator on the operator's word only: every orchestrator is told, and the record is cleared, proved by a lookup that prints nothing. |

## Tests

`./tests/run-tests.sh` runs everywhere: no network, no terminal automation, isolated home
per case. `./tests/e2e.sh` plays one real round against a live terminal — a brief, a
session at a tier, a placed tab, a verified close — and is kept out of the default suite on
purpose, because it costs tokens and needs the app running.

## Install

```
/plugin marketplace add LounisBou/claude-plugins-marketplace
/plugin install orchestrator@lounisbou
/orchestrator:install
```

The last step creates the state directory, unwires any tap a previous install
left in front of your status line, and needs the host at 2.1.287 or later (the
hooks module's events). The gauge itself needs no wiring: the module measures
every session in-process, and a session restart makes it take effect.

This release was tested against the host at 2.1.295.

## Requirements

- `bash` 3.2 (the version macOS ships), `jq`
- `python3` for the tab tooling's environment
- for `model-routing`: bind `deep`, `standard` and `light` in
  `~/.claude/claude-orchestrator/models.json` (the installer creates it empty) to the
  host's family aliases, which it resolves to each family's latest model — never to a
  versioned identifier, which goes stale silently (the launcher warns when it finds one).
  With a tier unbound, the orchestrator picks the model, writes the choice and its reason in
  the brief, and tells you at the spawn.
- for `iterm-agents`: name in `~/.claude/claude-orchestrator/mcp.json` (the installer
  creates it empty) the servers this machine offers, in the host's own shape, and list
  the elementary ones under `default`. An agent gets that set plus what its spawn line
  adds; an empty catalogue means every session launches with no server at all.
- for `iterm-agents` only: macOS, iTerm2 with its API enabled (Preferences > General >
  Magic), and the environment `/orchestrator:install` builds under the state directory
  (~19 MB). One macOS approval, on the first connection. Tab placement needs no
  Accessibility grant and brings nothing to the front: the app reorders its own tabs

## How the gauge works

The hooks module measures every session in-process. After each turn the host
fires a measure event that carries the fill itself — tokens, window,
percentage, the model that answered — and the module writes one line to
`~/.claude/claude-orchestrator/measure/<session-id>.json`, the only file
external processes read: the launcher's `--inherit-model` takes the model from
it, and any tool of your own can read the figures the same way.

```bash
cat ~/.claude/claude-orchestrator/measure/$CLAUDE_CODE_SESSION_ID.json
# {"context_tokens":91000,"context_window":250000,"context_percent":36.4,
#  "model":"...","updated_at":"..."}
```

Past the gate —
300,000 tokens (30 %) on a window of 1,000,000 tokens or more, the common case, and 80 % of a smaller window —
the context gate puts the role's line in front of every prompt of an
orchestration session, and a band above the prompt shows the fill;
`/orchestrator:status` answers the same figures for every session on the
machine. Measured beats estimated: in observed runs, agents' self-estimates
ran 13 points above the gauge.

## The method in five lines

1. You orchestrate; you never implement. Implementers run in separate sessions, one agent, one phase, one draft PR stacked on the previous phase's branch head. Merges are never awaited.
2. Every brief is a file the fresh session can open, with contracts verbatim, a non-goals list ending in "STOP and ask", and state-verification commands.
3. Review on evidence: diff it yourself, re-run the one command that decides the verdict, treat every claim — cleanup claims included — as a claim. Heavy reading goes to a review session spawned for the round (its readers sized by you, from its own reading to several lenses, and it reports once); the verdict stays with you, and the session is closed when the round is judged.
4. Context is a gate at 300,000 tokens (30 %) on a window of 1,000,000 tokens or more, the common case, and 80 % of a smaller window: never dispatch a phase to an agent past it, and an agent crossing it mid-work finishes the unit and stops. Rotation is a resume brief for a fresh session.
5. Succession is the orchestrator's to trigger, at a quiet moment, with a standing pointer-based brief; the successor verifies the state on the artifacts, re-identifies itself to the agents, confirms the takeover, then closes the predecessor's tab.

## Tab layout

The orchestrator's tab sits immediately left of its implementer's tab. A plain
`spawn` appends at the far right of the window, which is beside the orchestrator
only when it happens to be the last tab — so always name an anchor, and name the
one you know: `--right-of self` resolves the calling session's own tty from the
process tree. `--left-of <tty>` covers the mirror case, and `move` repairs the
layout after the fact.

## Uninstall

```
/orchestrator:uninstall     # or ./uninstall.sh
```

## License

MIT
