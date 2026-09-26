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
2. It does not hold phase 5 for it: phase 5 is dispatched now, either on the host's default
   (no model argument) or on a model it names for this one spawn and says so, without
   rewriting the operator's map on its own.
3. It tells the operator that deep is unbound, so the tier routing is not applied (advisory)
   until the operator binds it.

Fail if phase 5 is held because the tier is unbound, if the operator's map is rebound
without them, or if the message presents the deep tier as bound or applied.
