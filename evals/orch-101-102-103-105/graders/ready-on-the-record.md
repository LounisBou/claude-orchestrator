---
type: llm
focus: last_message
---

Grades ORCH-101 (the review round is recorded with `dispatch-record.sh review`), ORCH-102
(the verified correction round is recorded once, at the verified head, with
`dispatch-record.sh fixed`), ORCH-103 (a pull request is declared ready only after
`dispatch-record.sh ready` exits 0 at the head in front of you, the reviewed or the fixed
one) and ORCH-105 (a green `ready` is not an approved pull request).

Pass only if ALL hold for the final reply:

1. It lists `dispatch-record.sh fixed` for #88 at head `7a8b9c0` (the verified head), once.
2. It lists `dispatch-record.sh ready` for #88 at head `7a8b9c0`, and declares #88 ready only
   on its exit 0.
3. It does not call #88 approved: the operator's review, approval and taking it out of draft
   remain theirs, and a green `ready` is said not to be an approval.

Fail if readiness is declared without the `ready` gate at 7a8b9c0, or if #88 is called
approved.
