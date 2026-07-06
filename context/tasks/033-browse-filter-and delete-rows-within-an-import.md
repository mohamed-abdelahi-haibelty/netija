Requirements:

Auth-protected, paginated endpoint to list the attempts belonging to one import, with server-side search (by name / exam number) and filters (e.g. by serie, decision). Built for potentially 50k rows — paginate, don't load all at once.
Row deletion: delete a single attempt, or several selected attempts, in one action. Each deletion fans out: remove from DB + Meilisearch + Redis. Requires confirmation; shows how many rows will be deleted.
Dashboard UI: a data table for an import's rows with search, filter, pagination, row selection (checkboxes), and a bulk-delete action with confirmation.

Out of scope: import-level delete (031), Meilisearch/Redis admin panels (034/035).
Done when: the table loads large imports performantly (paginated); search/filter work server-side; single and bulk row deletion removes rows from DB + search + cache (no ghosts); confirmation required; tests cover pagination, filtering, and the delete fan-out.
