import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { resolve } from 'path';

// Load from the monorepo root .env when running drizzle-kit from api/
config({ path: resolve(process.cwd(), '../.env') });

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL must be set (copy .env.example → .env at repo root)');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
