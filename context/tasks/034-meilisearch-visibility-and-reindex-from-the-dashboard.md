Requirements:

Auth-protected endpoints to: view Meilisearch index status (document count, settings, health) and the documents for a given import or query (read-only inspection), and to trigger a full reindex from Postgres.
Dashboard UI: an index panel showing the status/counts, a way to inspect indexed documents, and a "Reindex" button with confirmation (reindex can be heavy — show progress or a clear "in progress" state).
Reindex must rebuild from Postgres (the source of truth), only including published years, consistent with the existing index builder — reuse it, don't reimplement.

Out of scope: Redis panel (035).
Done when: the panel shows accurate index status; inspection matches what's actually indexed; reindex rebuilds correctly (verified against DB); only published years are indexed; auth-gated; tests cover the reindex trigger and status read.
