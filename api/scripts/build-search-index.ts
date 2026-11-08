/**
 * Full rebuild of the Meilisearch attempts index from Postgres.
 * Safe to re-run at any time: wipes the existing index contents and repopulates.
 *
 * Usage (from the project root):
 *   npx tsx api/scripts/build-search-index.ts
 * Or (from api/):
 *   npm run search:reindex
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Meilisearch } from 'meilisearch';
import { buildNameIndex } from '../src/services/meiliIndex.js';
import * as schema from '../src/db/schema.js';

for (const path of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../.env')]) {
  const { error } = config({ path, override: false });
  if (!error && process.env['DATABASE_URL']) break;
}

const appEnv = process.env['APP_ENV'] ?? process.env['NODE_ENV'] ?? '';
if (appEnv === 'production') {
  console.error('Error: refusing to rebuild index in production without explicit APP_ENV check.');
  process.exit(1);
}

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  console.error('Error: DATABASE_URL is not set.');
  process.exit(1);
}

const meiliHost = process.env['MEILI_HOST'] ?? 'http://localhost:7700';
const meiliKey = process.env['MEILI_MASTER_KEY'];

const pool = new Pool({ connectionString: dbUrl });
const db = drizzle(pool, { schema });
const meili = new Meilisearch({ host: meiliHost, apiKey: meiliKey });

(async () => {
  const count = await buildNameIndex(db, meili);
  console.log(`Indexed ${String(count)} attempt(s) into Meilisearch.`);
  await pool.end();
})().catch((e: unknown) => { console.error(e); process.exit(1); });
