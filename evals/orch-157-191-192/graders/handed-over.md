---
# Grades ORCH-192: « handed over » is sent to the successor
# (a send addressed to Orch : shop-front [9f8r7d] — a SendMessage line, or a `to:` line —
# whose message, within the same fenced block, says handed over; the words in prose do not count)
type: regex
flags: im
---

(?:SendMessage\b[^\n`]*?|^[ \t]*["']?to["']?[ \t]*[:=][ \t]*)["'«]?[ \t]*(?:Orch : shop-front[ \t]*)?\[?9f8r7d\]?[^`]{0,200}?\bhanded over\b
