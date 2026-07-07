'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Loader2, RefreshCw, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import { PropertyRow } from '@/components/PropertyRow';
import { ReindexDialog } from '@/components/admin/ReindexDialog';
import type {
  SearchIndexStatusResult,
  SearchIndexDocumentsResult,
  SearchIndexReindexResult,
} from 'shared';

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;

type StatusLoadState = 'loading' | 'loaded' | 'error';
type DocumentsLoadState = 'loading' | 'loaded' | 'notFound' | 'error';

// Task 034: read-only Meilisearch visibility (index status + document
// inspection) and a manual full-reindex trigger, reusing the same builder
// publish/unpublish/delete already call — see api/src/services/meiliIndex.ts.
export default function SearchIndexPage() {
  const { t } = useTranslation();

  const [statusLoad, setStatusLoad] = useState<StatusLoadState>('loading');
  const [status, setStatus] = useState<SearchIndexStatusResult | null>(null);
  const [reindexOpen, setReindexOpen] = useState(false);
  const [reindexNotice, setReindexNotice] = useState<number | null>(null);

  const [docsLoad, setDocsLoad] = useState<DocumentsLoadState>('loading');
  const [docs, setDocs] = useState<SearchIndexDocumentsResult | null>(null);
  const [page, setPage] = useState(1);
  const [importIdInput, setImportIdInput] = useState('');
  const [importId, setImportId] = useState<number | undefined>(undefined);
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState<string | undefined>(undefined);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoad('loading');
    try {
      const data = await apiRequest<SearchIndexStatusResult>('/api/search-index/status', {
        credentials: 'include',
      });
      setStatus(data);
      setStatusLoad('loaded');
    } catch {
      setStatusLoad('error');
    }
  }, []);

  const loadDocuments = useCallback(
    async (targetPage: number) => {
      setDocsLoad('loading');
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('pageSize', String(PAGE_SIZE));
        if (importId !== undefined) params.set('importId', String(importId));
        else if (q) params.set('q', q);

        const data = await apiRequest<SearchIndexDocumentsResult>(
          `/api/search-index/documents?${params.toString()}`,
          { credentials: 'include' },
        );
        setDocs(data);
        setDocsLoad('loaded');
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'IMPORT_NOT_FOUND') {
          setDocsLoad('notFound');
        } else {
          setDocsLoad('error');
        }
      }
    },
    [importId, q],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadDocuments(page);
  }, [loadDocuments, page]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // importId and q are mutually exclusive (the API rejects both at once) —
  // typing into one immediately clears the other's input, rather than
  // letting a stale value silently fire an ambiguous request.
  const handleImportIdChange = (value: string) => {
    setImportIdInput(value);
    if (value.trim() !== '') {
      setSearchInput('');
      setQ(undefined);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      const trimmed = value.trim();
      setImportId(trimmed === '' ? undefined : Number(trimmed));
    }, FILTER_DEBOUNCE_MS);
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (value.trim() !== '') {
      setImportIdInput('');
      setImportId(undefined);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      const trimmed = value.trim();
      setQ(trimmed === '' ? undefined : trimmed);
    }, FILTER_DEBOUNCE_MS);
  };

  const totalPages = docs ? Math.max(1, Math.ceil(docs.total / docs.pageSize)) : 1;

  return (
    <section aria-labelledby="search-index-title">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 id="search-index-title" className="text-lg font-semibold text-foreground tracking-tight">
            {t('admin.searchIndex.pageTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.searchIndex.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setReindexOpen(true);
          }}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <RotateCw className="size-3.5" aria-hidden />
          {t('admin.searchIndex.reindexAction')}
        </button>
      </div>

      {reindexNotice !== null && (
        <p role="status" className="mb-4 text-sm text-status-pass-fg">
          {t('admin.searchIndex.reindexSuccess', { count: reindexNotice })}
        </p>
      )}

      {/* ── Status panel ── */}
      <div className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">{t('admin.searchIndex.statusTitle')}</h2>
          {statusLoad === 'loaded' && (
            <button
              type="button"
              onClick={() => void loadStatus()}
              aria-label={t('admin.searchIndex.refresh')}
              className={cn(
                'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <RefreshCw className="size-3" aria-hidden />
              {t('admin.searchIndex.refresh')}
            </button>
          )}
        </div>

        {statusLoad === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('admin.searchIndex.statusLoading')}
          </p>
        )}

        {statusLoad === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm text-status-fail-fg">
            <p>{t('admin.searchIndex.statusLoadError')}</p>
            <button
              type="button"
              onClick={() => void loadStatus()}
              className="text-sm text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {statusLoad === 'loaded' && status && (
          <div className="border-t border-border pt-1">
            <PropertyRow label={t('admin.searchIndex.colHealth')}>
              <span
                className={cn(
                  'font-medium',
                  status.healthy ? 'text-status-pass-fg' : 'text-status-fail-fg',
                )}
              >
                {status.healthy ? t('admin.searchIndex.healthOk') : t('admin.searchIndex.healthDown')}
              </span>
            </PropertyRow>
            <PropertyRow label={t('admin.searchIndex.colDocumentCount')}>
              {status.documentCount}
            </PropertyRow>
            <PropertyRow label={t('admin.searchIndex.colIndexing')}>
              {status.isIndexing ? t('admin.searchIndex.indexingYes') : t('admin.searchIndex.indexingNo')}
            </PropertyRow>
            <PropertyRow label={t('admin.searchIndex.colSearchable')}>
              {status.searchableAttributes.join(', ') || '—'}
            </PropertyRow>
            <PropertyRow label={t('admin.searchIndex.colSortable')}>
              {status.sortableAttributes.join(', ') || '—'}
            </PropertyRow>
            <PropertyRow label={t('admin.searchIndex.colFilterable')}>
              {status.filterableAttributes.join(', ') || '—'}
            </PropertyRow>
          </div>
        )}
      </div>

      {/* ── Document inspector ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">
          {t('admin.searchIndex.documentsTitle')}
        </h2>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="search-index-import-id" className="text-xs font-medium text-muted-foreground">
              {t('admin.searchIndex.filterImportIdLabel')}
            </label>
            <input
              id="search-index-import-id"
              type="number"
              min={1}
              inputMode="numeric"
              value={importIdInput}
              onChange={(e) => {
                handleImportIdChange(e.target.value);
              }}
              placeholder={t('admin.searchIndex.filterImportIdPlaceholder')}
              className="h-9 w-36 rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="search-index-query" className="text-xs font-medium text-muted-foreground">
              {t('admin.searchIndex.filterQueryLabel')}
            </label>
            <input
              id="search-index-query"
              type="text"
              value={searchInput}
              onChange={(e) => {
                handleSearchChange(e.target.value);
              }}
              placeholder={t('admin.searchIndex.filterQueryPlaceholder')}
              className="h-9 w-64 rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        {docsLoad === 'loading' && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t('admin.searchIndex.documentsLoading')}
          </p>
        )}

        {docsLoad === 'notFound' && (
          <p role="alert" className="text-sm text-status-fail-fg">
            {t('admin.searchIndex.importNotFound')}
          </p>
        )}

        {docsLoad === 'error' && (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm text-status-fail-fg">
            <p>{t('admin.searchIndex.documentsLoadError')}</p>
            <button
              type="button"
              onClick={() => void loadDocuments(page)}
              className="text-sm text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
            >
              {t('common.retry')}
            </button>
          </div>
        )}

        {docsLoad === 'loaded' && docs && docs.documents.length === 0 && (
          <div className="border-t border-border py-16 text-center">
            <p className="text-sm text-muted-foreground">{t('admin.searchIndex.documentsEmpty')}</p>
          </div>
        )}

        {docsLoad === 'loaded' && docs && docs.documents.length > 0 && (
          <>
            <div className="overflow-x-auto">
               <table className="admin-table w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {t('admin.searchIndex.colImportId')}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {t('admin.imports.colYear')}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {t('admin.rows.colExamNo')}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {t('admin.rows.colName')}
                    </th>
                    <th
                      scope="col"
                      className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                    >
                      {t('admin.rows.colSerie')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {docs.documents.map((doc) => (
                    <tr key={doc.slug} className="transition-colors duration-100 hover:bg-muted/50">
                      <td className="px-4 py-2.5 text-foreground tabular-nums">{doc.importId}</td>
                      <td className="px-4 py-2.5 text-foreground tabular-nums">{doc.examYear}</td>
                      <td className="px-4 py-2.5 text-foreground tabular-nums">{doc.examNo}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          {doc.nameFr && <span lang="fr">{doc.nameFr}</span>}
                          {doc.nameAr && (
                            <span lang="ar" dir="rtl">
                              {doc.nameAr}
                            </span>
                          )}
                          {!doc.nameFr && !doc.nameAr && <span className="text-muted-foreground">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-foreground">{doc.serie}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
              <span>{t('admin.searchIndex.totalDocuments', { count: docs.total })}</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPage((p) => Math.max(1, p - 1));
                  }}
                  disabled={page <= 1}
                  className={cn(
                    'inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium',
                    'border border-border text-muted-foreground',
                    'hover:bg-muted hover:text-foreground transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  <ChevronLeft className="size-3.5" aria-hidden />
                  {t('admin.rows.prevPage')}
                </button>
                <span aria-live="polite">{t('admin.rows.pageInfo', { page, totalPages })}</span>
                <button
                  type="button"
                  onClick={() => {
                    setPage((p) => Math.min(totalPages, p + 1));
                  }}
                  disabled={page >= totalPages}
                  className={cn(
                    'inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium',
                    'border border-border text-muted-foreground',
                    'hover:bg-muted hover:text-foreground transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {t('admin.rows.nextPage')}
                  <ChevronRight className="size-3.5" aria-hidden />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <ReindexDialog
        open={reindexOpen}
        onClose={() => {
          setReindexOpen(false);
        }}
        onReindexed={(result: SearchIndexReindexResult) => {
          setReindexOpen(false);
          setReindexNotice(result.documentCount);
          void loadStatus();
          void loadDocuments(page);
        }}
      />
    </section>
  );
}
