This is the trickiest one — review its approach carefully.
Requirements:

Auth-protected endpoint to cancel an in-progress import. It must: stop/remove the BullMQ job, terminate or signal the spawned Python worker process for that job, and clean up any partially-loaded data so the DB is left consistent (either nothing loaded, or clearly marked incomplete and safe to delete via task 031).
Because a mid-load Python process may not stop instantly, define and implement the cancellation contract: how the worker checks for a cancel signal, and what state the import is left in (e.g. status cancelled, partial rows rolled back or flagged).
Recommend the safest approach given our single-transaction loader (task 020): ideally the load is one transaction, so cancelling before commit leaves zero rows — explain how cancellation interacts with that.
Dashboard: a cancel action on a processing import, with confirmation; status reflects cancelling → cancelled.

Out of scope: deleting completed imports (031).
First INVESTIGATE and report how cancellation interacts with the loader's transaction and the spawned process, recommend the safest design, and wait for my go-ahead before implementing.
Done when: cancelling a stuck import stops the job and the Python process, leaves the DB consistent (no partial published data), sets a clear final status, and tests cover the cancel path including the "leaves no orphan rows" guarantee.
