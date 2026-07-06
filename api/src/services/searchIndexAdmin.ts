import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import type { MeiliClient } from '../lib/meili.js';
import { ATTEMPTS_INDEX } from '../lib/meili.js';
import { imports } from '../db/schema.js';
import { buildNameIndex } from './meiliIndex.js';
import type {
  ExamType,
  SearchIndexStatusResult,
  SearchIndexDocument,
  SearchIndexDocumentsResult,
  SearchIndexReindexResult,
} from 'shared';

// Mirrors meiliIndex.ts's own AttemptDocument — this file never writes
// documents, only reads/reindexes, so it declares its own read-side shape
// rather than importing a non-exported interface.
interface AttemptDocument {
  id: string;
  importId: number;
  examType: ExamType;
  examYear: number;
  examNo: string;
  nameFr: string | null;
  nameAr: string | null;
  serie: string | null;
}

function toSearchIndexDocument(doc: AttemptDocument): SearchIndexDocument {
  return {
    slug: doc.id,
    importId: doc.importId,
    examType: doc.examType,
    examYear: doc.examYear,
    examNo: doc.examNo,
    nameFr: doc.nameFr,
    nameAr: doc.nameAr,
    serie: doc.serie,
  };
}

// Read-only status for the admin panel: document count, whether Meilisearch
// is mid-indexing, its reachability, and the settings buildNameIndex applies.
export async function getSearchIndexStatus(meili: MeiliClient): Promise<SearchIndexStatusResult> {
  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);

  const [stats, settings, healthy] = await Promise.all([
    index.getStats(),
    index.getSettings(),
    meili
      .health()
      .then(() => true)
      .catch(() => false),
  ]);

  return {
    documentCount: stats.numberOfDocuments,
    isIndexing: stats.isIndexing,
    healthy,
    searchableAttributes: settings.searchableAttributes ?? [],
    sortableAttributes: settings.sortableAttributes ?? [],
    filterableAttributes: (settings.filterableAttributes ?? []).filter(
      (a): a is string => typeof a === 'string',
    ),
  };
}

// Read-only document inspection, scoped to one import, a free-text query
// (the same search the public name-search endpoint runs), or neither (a
// plain paginated browse of the whole index). Returns null when an
// importId is given but doesn't exist (route -> 404) — never silently
// falls back to an unscoped browse.
export async function listSearchIndexDocuments(
  db: Db,
  meili: MeiliClient,
  params: { importId?: number; q?: string; page: number; pageSize: number },
): Promise<SearchIndexDocumentsResult | null> {
  const { importId, q, page, pageSize } = params;

  if (importId !== undefined) {
    const [existing] = await db.select({ id: imports.id }).from(imports).where(eq(imports.id, importId)).limit(1);
    if (!existing) return null;
  }

  const index = meili.index<AttemptDocument>(ATTEMPTS_INDEX);
  const offset = (page - 1) * pageSize;

  if (q !== undefined) {
    const result = await index.search(q, { limit: pageSize, offset });
    return {
      documents: result.hits.map(toSearchIndexDocument),
      total: result.estimatedTotalHits,
      page,
      pageSize,
    };
  }

  // importId is a validated, coerced positive integer (schemas/searchIndex.ts) —
  // safe to interpolate directly into the filter expression. No `sort` here:
  // Meilisearch's GET /documents endpoint (used whenever there's no filter)
  // doesn't accept it at all — only the POST .../fetch variant does.
  const filter = importId !== undefined ? `importId = ${String(importId)}` : undefined;
  const result = await index.getDocuments({ filter, limit: pageSize, offset });

  return {
    documents: result.results.map(toSearchIndexDocument),
    total: result.total,
    page,
    pageSize,
  };
}

// Rebuilds the whole index from Postgres — the source of truth — reusing
// the exact same builder publish/unpublish/delete already call (architecture.md
// invariant 6: Meilisearch is always rebuildable, never a source of truth).
export async function reindexSearchIndex(db: Db, meili: MeiliClient): Promise<SearchIndexReindexResult> {
  const documentCount = await buildNameIndex(db, meili);
  return { documentCount };
}
