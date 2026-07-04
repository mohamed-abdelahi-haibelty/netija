# 013b — Retrofit: Simplify to the Minimal-Data Model

**Depends on:** 013 (you have built through here)
**Context:** architecture.md, project-overview.md — both updated to the minimal model. This task makes the ALREADY-BUILT code match the new, privacy-minimized design.

## Why this task exists

Tasks 001–013 were built against an older design that stored NNI, birth date,
and birth place, and linked attempts into shared persons (person_links,
link_suggestions, see-also). For legal/privacy reasons the project now stores
and displays ONLY: name, exam number, exam year, serie, decision, moyenne.
There is no identity linking, no persons model, no see-also. This task removes
the now-unused pieces from what you already built so the codebase and database
match the new design before continuing.

## Requirements

### Database (new migration — never edit applied migrations)

- Drop the `persons`, `person_links`, and `link_suggestions` tables.
- Drop from `attempts` the columns: `nni`, `birth_date`, `birth_place`,
  `match_key` (and their indexes) keep `name_fr` and `name_ar`.
- Keep on `attempts`: exam_year, exam_no, name_fr, name_ar, serie
  (NOT NULL), decision (NOT NULL), decision_raw, moyenne (nullable),
  school/wilaya (drop them too),
  import_id, and the UNIQUE (exam_year, exam_no) constraint.
- The `attempts` table is now the only result-bearing table; a "result" is a
  single attempt row. There is no person concept.

### Code removal

- Remove the persons/person_links/link_suggestions Drizzle schema definitions.
- Remove any linking logic, match_key computation, and see-also query code
  from the student service (the dir1/dir2 suggestion queries go away entirely).
- Remove references to nni/birth_date/birth_place throughout api, shared types,
  and any seed data.

### Update the already-built read path (tasks 008, 012 were built old)

- Student lookup is now BY ATTEMPT, not by person. A result page is identified
  by its attempt (e.g. by exam_year + exam_no, or the attempt id) — decide and
  state which, and make it consistent with the search results' links.
- The student page shows: name, year, serie, decision, moyenne. No see-also
  section, no "other records", no multi-attempt-person aggregation.
- Seed data: regenerate to the new shape (attempts only; fabricated names;
  several years; some names repeated across years as SEPARATE rows).

## Out of scope

- The name-search grouping behavior (that's the rewritten task 009).
- Anything in the import pipeline (tasks 014+).

## Done when

- [ ] Migration drops the three tables and the unused columns; runs clean on a
      fresh DB and is a no-op on re-run.
- [ ] No reference to nni, birth_date, birth_place, match_key, person_links,
      link_suggestions, or see-also remains anywhere in api/, shared/, or web/.
- [ ] Existing tests updated: student/exam tests pass against the attempt-based
      model; removed-feature tests deleted.
- [ ] Seed data regenerated to attempts-only; the app builds and runs.
- [ ] `npm run build`, typecheck, lint, and all tests pass.
