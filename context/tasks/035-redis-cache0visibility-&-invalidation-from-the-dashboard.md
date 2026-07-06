Requirements:

Auth-protected endpoints to: view cached result keys (count, and inspect a given key's value), and invalidate cache — either a specific key, all result keys, or by pattern.
Dashboard UI: a cache panel showing cached-key info and buttons to invalidate a key or flush the result cache, with confirmation.
Never expose or allow touching non-result Redis data (rate-limit counters, BullMQ internals) — scope strictly to the result cache keys.

Done when: the panel shows result-cache contents accurately; invalidation clears the right keys and the next request rebuilds from DB; rate-limit/queue keys are untouchable; auth-gated; tests cover invalidation and scope-limiting.
