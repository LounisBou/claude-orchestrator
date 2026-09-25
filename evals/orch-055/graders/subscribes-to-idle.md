---
type: llm
focus: last_message
---

Grades ORCH-055 (after every message expecting work back, the orchestrator subscribes to
the agent's idle notice).

Pass only if the message sent to `Agent : shop p8 [44ax55]` carries an idle-notice
subscription (`notify_when_idle: true` on the send, or an equivalent subscription sent
alongside it), so that the agent idling without reporting surfaces.

Fail if the correction is sent with no idle subscription.
