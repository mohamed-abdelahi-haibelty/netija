import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

const url = process.env['DATABASE_URL'];
if (!url) throw new Error('DATABASE_URL environment variable is required');

export const pool = new Pool({ connectionString: url, max: 20 });

export const db = drizzle(pool, { schema });

export type Db = typeof db;
