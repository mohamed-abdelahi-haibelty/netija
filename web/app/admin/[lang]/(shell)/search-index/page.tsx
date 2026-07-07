'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import { useDebouncedSetter } from '@/lib/useDebouncedSetter';
import { PropertyRow } from '@/components/PropertyRow';
import { ReindexDialog } from '@/components/admin/ReindexDialog';
import { AdminStatusPanel } from '@/components/admin/AdminStatusPanel';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { LoadingState, ErrorState, NotFoundState, EmptyState as BaseEmptyState } from '@/components/ui/load-states';
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
  // A single shared debounce (not one per filter): importId and q are
  // mutually exclusive, so typing into one must cancel the other's still-
  // pending debounce rather than letting both eventually fire.
  const debounce = useDebouncedSetter(FILTER_DEBOUNCE_MS);

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

  // importId and q are mutually exclusive (the API rejects both at once) —
  // typing into one immediately clears the other's input, rather than
  // letting a stale value silently fire an ambiguous request.
  const handleImportIdChange = (value: string) => {
    setImportIdInput(value);
    if (value.trim() !== '') {
      setSearchInput('');
      setQ(undefined);
    }
    debounce(() => {
      setPage(1);
      const trimmed = value.trim();
      setImportId(trimmed === '' ? undefined : Number(trimmed));
    });
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (value.trim() !== '') {
      setImportIdInput('');
      setImportId(undefined);
    }
    debounce(() => {
      setPage(1);
      const trimmed = value.trim();
      setQ(trimmed === '' ? undefined : trimmed);
    });
  };

  const totalPages = docs ? Math.max(1, Math.ceil(docs.total / docs.pageSize)) : 1;

  return (
    <section aria-labelledby="search-index-title">
      <PageHeader
        title={t('admin.searchIndex.pageTitle')}
        subtitle={t('admin.searchIndex.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => { setReindexOpen(true); }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCw className="size-3.5" aria-hidden />
            {t('admin.searchIndex.reindexAction')}
          </button>
        }
      />

      {reindexNotice !== null && (
        <p role="status" className="mb-4 text-sm text-status-pass-fg">
          {t('admin.searchIndex.reindexSuccess', { count: reindexNotice })}
        </p>
      )}

      <AdminStatusPanel
        title={t('admin.searchIndex.statusTitle')}
        refreshLabel={t('admin.searchIndex.refresh')}
        loadState={statusLoad}
        loadingLabel={t('admin.searchIndex.statusLoading')}
        errorLabel={t('admin.searchIndex.statusLoadError')}
        retryLabel={t('common.retry')}
        onRefresh={() => void loadStatus()}
      >
        {status && (
          <>
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
          </>
        )}
      </AdminStatusPanel>

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

        {docsLoad === 'loading' && <LoadingState label={t('admin.searchIndex.documentsLoading')} />}

        {docsLoad === 'notFound' && <NotFoundState label={t('admin.searchIndex.importNotFound')} />}

        {docsLoad === 'error' && (
          <ErrorState
            label={t('admin.searchIndex.documentsLoadError')}
            onRetry={() => void loadDocuments(page)}
            retryLabel={t('common.retry')}
          />
        )}

        {docsLoad === 'loaded' && docs && docs.documents.length === 0 && (
          <BaseEmptyState label={t('admin.searchIndex.documentsEmpty')} />
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

            <Pagination
              page={page}
              totalPages={totalPages}
              total={docs.total}
              onPageChange={setPage}
              prevLabel={t('admin.rows.prevPage')}
              nextLabel={t('admin.rows.nextPage')}
              pageInfoLabel={t('admin.rows.pageInfo', { page, totalPages })}
              totalLabel={t('admin.searchIndex.totalDocuments', { count: docs.total })}
            />
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
