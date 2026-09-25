# Behaviour evals

The plugin's regression suite for its directives. Each case stages one situation in which
a rule of the plugin has to decide what a session does, and grades that decision. The suite
is run by the host's plugin evaluation command, twice per case: once with the plugin
loaded and once without it. A rule the suite covers is one whose absence the no-plugin arm
shows.

`SELECTION.md` says which rules are covered and why these ones: the operator's duties, the
critical rules whose text a rewrite moves to another file, and the critical rules stated in
more than one file. `docs/rules-inventory.md` marks every covered row `eval` and names its
case at the end of its `rule` cell.

## Layout

```
evals/
  SELECTION.md           the planned cases and the criteria that chose them
  <case-id>/
    prompt.md            frontmatter (max_turns, timeout_seconds, allowed_tools) + the staged situation
    graders/<name>.md    one grader per file; each cites the inventory ids it grades
  baseline-0.34.0.json   the baseline run
  results/               run output, never committed
```

A case id is the lowercase inventory ids it covers, joined by `-`; consecutive ids of one
family share their prefix (`orch-151-152-iterm-055` covers `ORCH-151`, `ORCH-152` and
`ITERM-055`).

## How a case is staged

- The prompt places the session at the moment of the action and names the plugin skill it
  runs. The cases measure obedience to a rule once the skill is loaded; whether the skill
  triggers is measured elsewhere.
- A case grades the decision, never its effect: the text the session writes, and the tool
  calls it attempts, read in the trace.
- A staged session is offered only the evaluation command's default tools (read, search,
  skill, and its own subagents). Tools that are not granted are absent from its list, not
  refused, so a session cannot attempt a shell call: prompts that grade commands tell the
  session it has no shell and ask it to write each command it decides to run, in order.
- `Write` is granted only where the graded decision is a written brief; the file lands in
  the run's sandbox directory and a grader reads it there.
- Nothing is granted that could open a terminal tab, spawn a session, send a cross-session
  message, push, or reach the forge: no `--allow-tools`, no `--allow-real-servers`, no
  `--scaffold`.
- A staged session can read the plugin's own files, so a rule moved to a reference file
  stays reachable, provided the skill tells the session to read it.

## Running it

From the repository root, with the host's command-line binary at a version that ships the
command (the baseline used 2.1.282). `<host-cli>` below stands for that binary: the
repository's policy keeps the host's name out of its files, so the placeholder is filled in
by whoever runs the suite.

Baseline, every case, both arms, three runs:

```bash
<host-cli> plugin eval . --ablation with-without --runs 3 -j 2 --no-publish --trust-plugin \
  --model <deep-tier model> --judge-model <standard-tier model> \
  --json evals/results/baseline.json
```

After a rewrite of the directives, one run per case, with the plugin only:

```bash
<host-cli> plugin eval . --ablation none --runs 1 -j 2 --no-publish --trust-plugin \
  --model <deep-tier model> --judge-model <standard-tier model>
```

and three runs (`--runs 3 --case <id>`) on any case that scored below its baseline.

`--case <glob>` splits a run too long for one sitting. `--trust-plugin` answers the
first-run trust question for this repository's own plugin; nothing else is trusted.

## Pinned models

- **Agent**: the model the `deep` tier binds on the machine that ran the baseline — the
  tier an orchestrator session runs at, so the suite reads the rules as their real reader
  does.
- **Judge**: the model the `standard` tier binds. It is never the agent's model, since a
  judge grading its own model's output favours it.

The identifiers themselves are passed on the command line only, never written in the
repository. A later run uses the same two, or restates the baseline: scores from two
different agent models are not comparable.

## Envelope

- `-j 2` at most.
- Never beside `tests/run-tests.sh`, and never two evaluation runs at once.
- `--no-publish` on every run: a report stays on the machine that made it.

## Reading a result

- A case that passes without the plugin proves nothing: it is rewritten until it fails
  without the plugin, or removed.
- A case not stable with the plugin (below three passes out of three at baseline) is either
  a rule badly obeyed today, reported as a finding, or a badly written case, rewritten.
- After a rewrite, a case scoring below its baseline is a finding until the mechanism of
  the drop is named.
