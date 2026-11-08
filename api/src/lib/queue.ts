import { Queue, type ConnectionOptions } from 'bullmq';
import type { CanonicalField, ExamType } from 'shared';

const url = process.env['REDIS_URL'];
if (!url) throw new Error('REDIS_URL environment variable is required');

// Passed as plain options rather than a shared ioredis.Redis instance: BullMQ
// bundles its own ioredis version, which TypeScript treats as a distinct,
// incompatible type from the app's own `ioredis` dependency (lib/redis.ts).
// Plain options sidestep that — BullMQ constructs its own connection from
// them. maxRetriesPerRequest is disabled because BullMQ blocks on this
// connection (per BullMQ's docs) and manages its own retry/backoff.
function parseConnectionOptions(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 6379),
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export const queueConnection = parseConnectionOptions(url);

export const IMPORT_QUEUE_NAME = 'import';

// Bounded retries with exponential backoff for transient failures (see
// error-handling.md: "max 2 retries with exponential backoff"). A job that
// exhausts these is marked failed by the queue worker (queueWorker.ts).
export const IMPORT_JOB_ATTEMPTS = 3;
export const IMPORT_JOB_BACKOFF_MS = 2000;

export interface ImportJobData {
  importId: number;
  examType: ExamType;
  examYear: number;
  mapping: Record<string, CanonicalField>;
}

export const importQueue = new Queue<ImportJobData>(IMPORT_QUEUE_NAME, {
  connection: queueConnection,
});
