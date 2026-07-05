# 030 — Results-Day Runbook & Rehearsal

**Depends on:** 029
**Context:** project-overview.md (the 5–10 minute pipeline — this task proves it).

## Goal
The drill that turns the speed requirement from a hope into a rehearsed procedure.

## Requirements
- A written runbook: the exact ordered steps from "file received" to "published and verified", with the expected duration of each step, the operator action at each, the failure branches (new column format → remap path; smoke failure → halt-and-diagnose path; publish rollback), and the pre-day checklist (admin logged in, production rehearsal done, aliases warmed, monitoring green, backups fresh).
- A full timed rehearsal on production, unpublished, using last year's real file end to end: import last year's file as a new unpublished import → preview/confirm → import → smoke pass → publish → spot-check searches (by number and by name, both locales) → unpublish and delete the rehearsal import so it leaves no trace in the live data. There is no separate staging environment; production's unpublished state is the rehearsal space.
- Timings recorded per step; any step that needed improvisation triggers a runbook fix and, if needed, follow-up tasks; alias dictionary verified warmed by the rehearsal.
- The rehearsal repeated until it completes within 10 minutes with zero improvisation.

## Out of scope
- New features — only runbook fixes and small friction removals discovered by the drill.

## Done when
- [ ] A completed rehearsal log shows the full pipeline ≤ 10 minutes on production (unpublished) with last year's file, followed by cleanup (unpublish + delete) of the rehearsal import.
- [ ] The runbook stands alone: someone who didn't build the system could execute results day from it.
- [ ] progress-tracker.md records the drill results and any spawned follow-ups.
