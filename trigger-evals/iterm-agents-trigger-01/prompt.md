---
# intent: spawning an agent tab with a startup prompt and verifying it
max_turns: 3
timeout_seconds: 180
allowed_tools: [Read, Glob, Grep, Skill]
---

Open a new iTerm2 tab running a fresh agent session in /work/app with the startup prompt 'Read and execute briefs/phase-2.md', and confirm it actually started.
