---
type: llm
focus: last_message
---

Grades ITERM-005 (`list` prints the tab title, the session's name and `self`; read it
before closing), ITERM-019 (a tab is closed only by `--tty` with `--expect-title`, never by
title alone or tab position), ITERM-064 (a title starts with an activity glyph that flips on
its own: match on words, never on the glyph) and ITERM-065 (tty numbers are recycled: never
reuse a stored tty across a close, re-`list` every time).

Pass only if ALL hold for the commands listed:

1. The session runs `list` first and takes the tty from that fresh listing, not the stored
   `ttys012`.
2. The close is `close --tty <tty from the listing> --expect-title` with words of the title
   (for example `Agent : shop p3`).
3. The expected title does not include the glyph `⠐`.

Fail if the close uses `ttys012` without re-listing, closes by title or position alone, or
matches on the glyph.
