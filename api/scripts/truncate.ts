import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(process.cwd(), '../.env') });

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const db = drizzle(pool);

async function main(): Promise<void> {
  await db.execute(
    sql`TRUNCATE rejects, attempts, imports, column_aliases RESTART IDENTITY CASCADE`,
  );
  console.log('All tables truncated.');
}

main()
  .catch((e: unknown) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
