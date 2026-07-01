# 023 — Suggestion Review (API + Admin UI)

**Depends on:** 021, 012
**Context:** project-overview.md (admin flow step 6, public see-also), testing.md (suggestions scenarios).

## Goal
The human side of identity: reviewing, accepting, and rejecting link suggestions — quickly.

## Requirements
- Auth-protected endpoints: list pending suggestions sorted for fast review (strongest evidence first — exact name + same serie at the top), with enough context to judge (both records' names, years, series, birth info); accept — repoint the losing person's links to the surviving person, remove the now-empty person, mark accepted with audit fields; reject — mark rejected. Both idempotent and reversible in effect (an accepted merge can be undone by unlinking).
- Accept/reject immediately affects the public see-also payloads and merged pages (cache invalidation included).
- Admin UI: the queue with its context and one-action accept/reject, supporting efficient sequential review of the one-time historical batch (e.g. the 2019↔2020 list).

## Out of scope
- New suggestion-generation rules (021 owns them).

## Done when
- [ ] All suggestion scenarios in testing.md pass: queue contents, accept merges pages end to end, reject clears see-also, idempotency, auth gating.
- [ ] After accepting the seeded suggestion, the redemption-arc person shows all attempts on one page.
