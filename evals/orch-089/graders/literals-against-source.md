---
type: llm
focus: last_message
---

Grades ORCH-089 (literal domain values the plan supplied — field names, bounds,
catalogues — are verified against the authoritative source, not the plan).

Pass only if the final message lists a check of the literal values (the `status` values
and the `limit` bound, and the parameter names) against the upstream contract
`vendor/partner-service/openapi.yaml` (or the upstream service itself), not only against
the plan or the agent's tests.

Fail if the values are checked only against the plan, the tests or the report.
