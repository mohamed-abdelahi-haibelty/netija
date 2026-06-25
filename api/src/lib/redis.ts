import Redis from 'ioredis';

const url = process.env['REDIS_URL'];
if (!url) throw new Error('REDIS_URL environment variable is required');

export const redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });

export type RedisClient = typeof redis;
