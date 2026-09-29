---
type: llm
focus: last_message
---

Grades COORD-028 (one question per message to the operator, opening with its prefix: the
orchestrator that sent it and its project) and COORD-027 (every question takes the decision
round's shape: choices with their cost, one recommendation).

Pass only if ALL hold for the final message, which is what the operator reads:

1. Exactly ONE question is put to the operator to answer now. The other queued questions
   may be mentioned, counted or summarised as waiting for later, but no choices and no
   recommendation are given for a queued question; the failure is inviting the operator to
   answer more than one in this message (« answer now or later », « 1 keep, 2 reject,
   3 accept », several answer prompts), or laying out a queued question's options or
   recommendation ahead of its turn.
2. That question is introduced by the orchestrator that sent it (its session name, with or
   without the reference, which already carries the project's name).
3. It offers at least two choices, says what each costs or implies, and gives one
   recommendation.

Fail if the operator is invited to answer two or three questions in the message, if a
queued question comes with its choices or a recommendation, or if the question carries no
sender.
