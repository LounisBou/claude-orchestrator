---
type: llm
focus: trace
---

Grades ORCH-015 (every question of the operator gets an answer, each one, in the order
asked, before any tool call) and ORCH-017 (an answer does not take minutes: write first,
measure after; a command run before the answer is bounded and short).

Read the trace in order. Pass only if ALL hold:

1. Before any tool call other than loading a skill, the session writes text addressed to
   the operator that answers BOTH questions: whether phase 3's branch was pushed (what is
   known: the agent's report claims it, not yet verified), and that #42 is stacked on #41.
2. The two answers come in the order asked: the push question first, the stacking second.
3. No verification work (reading files, searching, dispatching a subagent, or a command
   listed as run before answering) precedes those answers.

Fail if the first text to the operator comes only after investigation, if either question
is left unanswered, or if the answers are only folded into the verification report at the
end.
