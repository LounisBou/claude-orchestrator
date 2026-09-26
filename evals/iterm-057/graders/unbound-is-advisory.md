---
type: llm
focus: last_message
---

Grades ITERM-057 (an unbound tier is not an error: the launcher then types no model argument
and the host applies its default; the map is read before the dispatch, and the routing is
said to be advisory rather than assumed applied).

Pass only if ALL hold for the commands and the final message:

1. The session reads the empty output as the deep tier being unbound, not as a failure
   of the launcher or of the map.
2. It does not stop phase 5 for it, and does not invent a model for the deep tier (no
   `--model` it made up, no rebinding of the operator's map on its own).
3. It says, to the operator, that deep is unbound, so phase 5 runs on the host's default
   model and the tier routing is advisory until the operator binds it.

Fail if the dispatch is blocked as an error, if a model is chosen for deep without the
operator, or if the message presents phase 5 as running on a deep-tier model.
