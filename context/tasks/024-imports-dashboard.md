# 024 — Imports Dashboard

**Depends on:** 019, 022
**Context:** project-overview.md (admin flow), error-handling.md (frontend rules).

## Goal
The admin's single view of the pipeline: every uploaded file, its journey, and its outcomes.

## Requirements
- Auth-protected dashboard listing all imports with: file name, exam year, status through the full lifecycle, live progress while processing (polling is fine), the summary (inserted / rejected / new people), smoke result, publish state, and failure reason when failed.
- Reject-report download per import.
- Entry points to the upload flow (014/018) and the publish controls (022) from here, forming one coherent admin journey: upload → preview/confirm → watch progress → smoke → publish → review suggestions.
- Localized; honest empty/loading/error states; axe-clean.

## Out of scope
- Any new pipeline behavior — this task is presentation and wiring only.

## Done when
- [ ] UI tests: list renders all states correctly from mocked data; progress updates; report download link present; unauthenticated access redirects.
- [ ] A manual end-to-end pass on a fixture file walks the entire journey from upload to published without leaving the dashboard flow.
