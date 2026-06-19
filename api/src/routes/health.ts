import { Hono } from 'hono';
import type { AppEnv } from '../types.js';
import { checkPostgres, checkRedis, checkMeilisearch } from '../lib/healthChecks.js';

const health = new Hono<AppEnv>();

health.get('/', (c) => c.json({ status: 'ok' }));

health.get('/ready', async (c) => {
  const [postgres, redis, meilisearch] = await Promise.all([
    checkPostgres(process.env['DATABASE_URL'] ?? ''),
    checkRedis(process.env['REDIS_URL'] ?? ''),
    checkMeilisearch(process.env['MEILISEARCH_URL'] ?? ''),
  ]);

  const allOk = postgres && redis && meilisearch;
  return c.json({ postgres, redis, meilisearch }, allOk ? 200 : 503);
});

export default health;
