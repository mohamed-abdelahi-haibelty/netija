# 028 — Performance Pass

**Depends on:** 027, 020
**Context:** architecture.md (performance architecture, import speed budget), project-overview.md (goals 4–6).

## Goal
Meet the two hard performance promises: a fast site under spike conditions and a sub-2-minute import.

## Requirements
- Frontend: static or incremental rendering for public pages where data freshness allows (respecting publish-time invalidation), bundle inspection with removal of avoidable weight, image/font loading optimized, no layout shift from async content (reserved space), interaction latency reviewed on the autocomplete path.
- API: verify cache hit-rates on the hot paths; confirm no N+1 query patterns on the student page; load-test the search endpoints at the results-day rate (~333 req/s with realistic cache behavior) on dev hardware and document the results.
- Pipeline: generate a synthetic 50,000-row file in a historical format; run the full pipeline (clean → load → link → index) and document the timing against the 2-minute budget; fix what misses it (batching sizes, indexes) until it passes.
- Findings and measured numbers recorded in the tracker.

## Out of scope
- Infrastructure changes (029); premature optimizations not tied to a measured miss.

## Done when
- [ ] The 50k synthetic import completes under 2 minutes, documented with the measurement.
- [ ] Load-test results documented showing the public path sustains the target rate locally.
- [ ] Lighthouse Performance ≥ 90 maintained after changes.
