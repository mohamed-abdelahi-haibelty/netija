import { Pool } from 'pg';
import Redis from 'ioredis';

export async function checkPostgres(url: string): Promise<boolean> {
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end();
  }
}

export async function checkRedis(url: string): Promise<boolean> {
  if (!url) return false;
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 0 });
  try {
    await redis.connect();
    await redis.ping();
    return true;
  } catch {
    return false;
  } finally {
    redis.disconnect();
  }
}

export async function checkMeilisearch(url: string): Promise<boolean> {
  if (!url) return false;
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
