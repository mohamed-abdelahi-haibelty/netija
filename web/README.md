# Netija web

Next.js frontend for the public results portal and authenticated admin dashboard. Supports French and Arabic, including right-to-left layouts.

Follow the [root setup guide](../README.md) to configure the API, database, worker, and seed data. From the repository root:

```bash
npm run dev --workspace=web
npm run test --workspace=web -- --runInBand
npm run typecheck --workspace=web
npm run build --workspace=web
```

Configuration is loaded from the root `.env`. `API_URL` is used server-side; `NEXT_PUBLIC_API_URL` must be reachable from the browser. The frontend accesses data through the Hono API, never directly through PostgreSQL, Redis, or Meilisearch.
