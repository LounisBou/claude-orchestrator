# Triggering evals

Whether each skill of the plugin is loaded when it should be, and only then. The behaviour
suite under `evals/` names the skill in every prompt and grades what the session does once
it is loaded; this set names nothing and grades the one decision that comes before: does
the session, reading the skills' `description` lines, pick that skill for this request.

## What the set measures

Per skill, two kinds of query, one case each:

- `<skill>-trigger-NN` — a realistic request a user or a supervising session would type,
  that the skill is for. It never names the skill, its command or its scripts: a query that
  names the skill measures reading, not triggering.
- `<skill>-no-trigger-NN` — a near miss: the same vocabulary for a different need, or a
  request meant for a sibling skill of this plugin.

Each prompt's frontmatter carries the query's intent in one comment line. Every skill has
at least six cases of each kind; `tests/run-tests.sh` checks that, and that every case names
an existing skill.

The deciding grader is a `tool_used` grader on the `Skill` tool whose `input_match` is the
skill's full name, anchored on both quotes (`"skill": "orchestrator:<skill>"`, the plugin
prefix optional), so a sibling's invocation never satisfies it. A trigger case passes when
the skill is loaded at least once; a no-trigger case passes when it is never loaded. A
case is capped at three turns: the choice is made on the first tool call.

## Running it

From the repository root, one skill per call, with the plugin only. `<host-cli>` is the
host's command-line binary, as in `evals/README.md`; `<out>` is a directory outside the
checkout.

```bash
<host-cli> plugin eval . --eval-dir trigger-evals --case '<skill>-*' --ablation none \
  --runs 3 -j 2 --no-publish --trust-plugin \
  --model <deep-tier model> --judge-model <deep-tier model> \
  --output-dir <out>/<label> --json <out>/<label>/run.json
```

No case grants a tool beyond the evaluation command's defaults; no `--allow-tools` is
passed. The envelope is the behaviour suite's: `-j 2` at most, never beside
`tests/run-tests.sh`, never beside another evaluation run.

## Reading the rate

For one skill, over its cases and their runs:

- should-trigger rate = runs of its `trigger` cases that passed / runs of its `trigger` cases
- should-not-trigger rate = runs of its `no-trigger` cases that passed / runs of its
  `no-trigger` cases

A skill's `description` is rewritten only when one side is below 100 %, and the rewrite is
kept only when the two sides' combined rate is strictly higher and neither side fell, on
the same set and the same settings. The set is frozen once a skill's rate before a rewrite
is measured: a query tuned to the new wording would pass anything.
