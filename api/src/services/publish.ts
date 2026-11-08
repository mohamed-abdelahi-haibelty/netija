import { eq, and } from 'drizzle-orm';
import * as Sentry from '@sentry/node';
import type { Db } from '../db/client.js';
import type { RedisClient } from '../lib/redis.js';
import type { MeiliClient } from '../lib/meili.js';
import { attempts, imports } from '../db/schema.js';
import { buildNameIndex } from './meiliIndex.js';
import { invalidateYearsCache } from './examSearch.js';
import { invalidateAttemptCaches } from './cacheInvalidation.js';
import { purgeCloudflareCache } from '../lib/cloudflare.js';
import type { ImportPublishResult } from 'shared';

// Thrown by publishImport when the import's smoke check hasn't passed yet
// (architecture.md invariant 12: "Publishing is blocked until the automated
// smoke verification for that import has passed"). The route turns this into
// 409 SMOKE_NOT_PASSED.
export class SmokeNotPassedError extends Error {
  constructor() {
    super('Publishing is blocked until the automated smoke verification passes.');
    this.name = 'SmokeNotPassedError';
  }
}

// Cloudflare purge is best-effort (see cloudflare.ts's own doc comment: "a
// missing credential ... shouldn't fail the whole publish"). A *failing*
// credential must not fail it either — the DB flip, Meili reindex, and
// Redis invalidation have already committed by the time this runs, so
// rethrowing here would report a successful publish back to the admin as
// an error while leaving the edge cache stale with no way to retry it.
async function purgeCloudflareCacheSafely(importId: number): Promise<void> {
  try {
    await purgeCloudflareCache();
  } catch (err) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'Cloudflare cache purge failed after publish/unpublish',
        importId,
        error: err instanceof Error ? err.message : String(err),
      }),
    );
    Sentry.captureException(err, { extra: { importId, stage: 'cloudflare-purge' } });
  }
}

// The years-list cache is a single key, invalidated once alongside every
// affected attempt's own cache entries (invalidateAttemptCaches).
async function invalidateImportCaches(db: Db, redis: RedisClient, importId: number): Promise<void> {
  const rows = await db
    .select({
      examType: attempts.examType,
      examYear: attempts.examYear,
      examNo: attempts.examNo,
      slug: attempts.publicSlug,
    })
    .from(attempts)
    .where(eq(attempts.importId, importId));

  await invalidateAttemptCaches(redis, rows);
  await invalidateYearsCache(redis);
}

// Publish is "one reversible click" (project-overview.md): an atomic,
// conditional flag flip — re-checking smoke_passed in the WHERE clause, not
// just in the earlier read, so a concurrent smoke re-run can't race a stale
// publish call into flipping visibility anyway — followed by the three
// derived-state refreshes the release flow requires: Meilisearch reindex,
// Redis invalidation, and the Cloudflare purge hook. Returns null when the
// import id doesn't exist (route -> 404).
export async function publishImport(
  db: Db,
  meili: MeiliClient,
  redis: RedisClient,
  importId: number,
): Promise<ImportPublishResult | null> {
  const [existing] = await db
    .select({ id: imports.id, smokePassed: imports.smokePassed })
    .from(imports)
    .where(eq(imports.id, importId))
    .limit(1);
  if (!existing) return null;

  if (existing.smokePassed !== true) {
    throw new SmokeNotPassedError();
  }

  const [flipped] = await db
    .update(imports)
    .set({ published: true, updatedAt: new Date() })
    .where(and(eq(imports.id, importId), eq(imports.smokePassed, true)))
    .returning({ id: imports.id });

  if (!flipped) {
    throw new SmokeNotPassedError();
  }

  await buildNameIndex(db, meili);
  await invalidateImportCaches(db, redis, importId);
  await purgeCloudflareCacheSafely(importId);

  return { published: true };
}

// Unpublish reverts visibility unconditionally — no smoke gate, since taking
// a year back down must always be possible. Returns null when the import id
// doesn't exist (route -> 404).
export async function unpublishImport(
  db: Db,
  meili: MeiliClient,
  redis: RedisClient,
  importId: number,
): Promise<ImportPublishResult | null> {
  const [flipped] = await db
    .update(imports)
    .set({ published: false, updatedAt: new Date() })
    .where(eq(imports.id, importId))
    .returning({ id: imports.id });
  if (!flipped) return null;

  await buildNameIndex(db, meili);
  await invalidateImportCaches(db, redis, importId);
  await purgeCloudflareCacheSafely(importId);

  return { published: false };
}
