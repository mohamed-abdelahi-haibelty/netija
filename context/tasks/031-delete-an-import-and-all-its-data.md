Read context/architecture.md, context/error-handling.md, context/code-standards.md. This adds the ability to delete a completed/failed import and all rows it created — for fixing mistakes like an Excel file imported under the wrong year.
Requirements:

Auth-protected endpoint to delete an import by id. It deletes: all attempts rows with that import_id, the import's rejects rows, the import record itself, AND removes those attempts from the Meilisearch index and invalidates their Redis cache entries. Deletion must be all-or-nothing (one transaction for the DB part; then search/cache cleanup).
The original uploaded Excel file: keep it or delete it — recommend which and why (I lean keep, for audit/re-import).
A confirmation step in the UI: deleting an import shows how many attempts will be removed and requires explicit confirmation (type-to-confirm or a clear modal), because it's irreversible.
Dashboard: a delete action per import in the imports list, with the confirmation.
Only allow deleting imports that are NOT currently processing (a running import must be cancelled first — task 032).

Out of scope: cancelling running imports (032), row-level deletion (033).
Done when: deleting an import removes its attempts from DB + Meilisearch + Redis (verified — no ghost rows appear in search after); the import and its rejects are gone; a published year's deletion also updates what's publicly visible; confirmation is required; tests cover the full fan-out and the "can't delete while processing" guard.
