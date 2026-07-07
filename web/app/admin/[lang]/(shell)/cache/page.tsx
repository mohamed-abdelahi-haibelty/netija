'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Loader2, Trash2 } from 'lucide-react';
import { ApiClientError, apiRequest } from '@/lib/api';
import { useDebouncedSetter } from '@/lib/useDebouncedSetter';
import { PropertyRow } from '@/components/PropertyRow';
import { InvalidateCacheKeyDialog } from '@/components/admin/InvalidateCacheKeyDialog';
import { FlushCacheDialog } from '@/components/admin/FlushCacheDialog';
import { AdminStatusPanel } from '@/components/admin/AdminStatusPanel';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination } from '@/components/ui/pagination';
import { LoadingState, ErrorState, NotFoundState, EmptyState as BaseEmptyState } from '@/components/ui/load-states';
import type { CacheStatusResult, CacheKeysListResult, CacheKeyInspectResult } from 'shared';

const PAGE_SIZE = 20;
const FILTER_DEBOUNCE_MS = 300;

type StatusLoadState = 'loading' | 'loaded' | 'error';
type KeysLoadState = 'loading' | 'loaded' | 'outOfScope' | 'error';
type InspectLoadState = 'loading' | 'loaded' | 'notFound' | 'error';

// Task 035: read-only Redis result-cache visibility (key counts + a
// paginated, inspectable key list) and invalidation (a single key, keys
// matching a pattern, or the whole result cache) — strictly scoped to the
// exam:/result: key families api/src/services/cacheAdmin.ts enforces.
// Rate-limit counters and BullMQ's own keys are never listed here: the API
// itself never returns them, regardless of what an admin types into the
// pattern filter.
export default function CachePage() {
  const { t } = useTranslation();

  const [statusLoad, setStatusLoad] = useState<StatusLoadState>('loading');
  const [status, setStatus] = useState<CacheStatusResult | null>(null);

  const [keysLoad, setKeysLoad] = useState<KeysLoadState>('loading');
  const [keysError, setKeysError] = useState<string | null>(null);
  const [keys, setKeys] = useState<CacheKeysListResult | null>(null);
  const [page, setPage] = useState(1);
  const [patternInput, setPatternInput] = useState('');
  const [pattern, setPattern] = useState<string | undefined>(undefined);
  const debounce = useDebouncedSetter(FILTER_DEBOUNCE_MS);

  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [inspectLoad, setInspectLoad] = useState<InspectLoadState>('loading');
  const [inspectResult, setInspectResult] = useState<CacheKeyInspectResult | null>(null);

  const [invalidateKey, setInvalidateKey] = useState<string | null>(null);
  const [flushOpen, setFlushOpen] = useState(false);
  const [flushNotice, setFlushNotice] = useState<number | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoad('loading');
    try {
      const data = await apiRequest<CacheStatusResult>('/api/cache/status', { credentials: 'include' });
      setStatus(data);
      setStatusLoad('loaded');
    } catch {
      setStatusLoad('error');
    }
  }, []);

  const loadKeys = useCallback(
    async (targetPage: number) => {
      setKeysLoad('loading');
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('pageSize', String(PAGE_SIZE));
        if (pattern) params.set('pattern', pattern);

        const data = await apiRequest<CacheKeysListResult>(`/api/cache/keys?${params.toString()}`, {
          credentials: 'include',
        });
        setKeys(data);
        setKeysLoad('loaded');
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'CACHE_KEY_OUT_OF_SCOPE') {
          setKeysError(err.message);
          setKeysLoad('outOfScope');
        } else {
          setKeysLoad('error');
        }
      }
    },
    [pattern],
  );

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    void loadKeys(page);
  }, [loadKeys, page]);

  const handlePatternChange = (value: string) => {
    setPatternInput(value);
    debounce(() => {
      setPage(1);
      const trimmed = value.trim();
      setPattern(trimmed === '' ? undefined : trimmed);
    });
  };

  const toggleInspect = async (key: string) => {
    if (expandedKey === key) {
      setExpandedKey(null);
      return;
    }
    setExpandedKey(key);
    setInspectLoad('loading');
    setInspectResult(null);
    try {
      const data = await apiRequest<CacheKeyInspectResult>(`/api/cache/keys/${encodeURIComponent(key)}`, {
        credentials: 'include',
      });
      setInspectResult(data);
      setInspectLoad('loaded');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'CACHE_KEY_NOT_FOUND') {
        setInspectLoad('notFound');
      } else {
        setInspectLoad('error');
      }
    }
  };

  const totalPages = keys ? Math.max(1, Math.ceil(keys.total / keys.pageSize)) : 1;

  return (
    <section aria-labelledby="cache-title">
      <PageHeader
        title={t('admin.cache.pageTitle')}
        subtitle={t('admin.cache.subtitle')}
        actions={
          <button
            type="button"
            onClick={() => { setFlushOpen(true); }}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-destructive/10 text-destructive text-sm font-medium hover:bg-destructive/20 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" aria-hidden />
            {pattern ? t('admin.cache.flushMatchingAction') : t('admin.cache.flushAllAction')}
          </button>
        }
      />

      {flushNotice !== null && (
        <p role="status" className="mb-4 text-sm text-status-pass-fg">
          {t('admin.cache.flushSuccess', { count: flushNotice })}
        </p>
      )}

      <AdminStatusPanel
        title={t('admin.cache.statusTitle')}
        refreshLabel={t('admin.cache.refresh')}
        loadState={statusLoad}
        loadingLabel={t('admin.cache.statusLoading')}
        errorLabel={t('admin.cache.statusLoadError')}
        retryLabel={t('common.retry')}
        onRefresh={() => void loadStatus()}
      >
        {status && (
          <>
            <PropertyRow label={t('admin.cache.colExamKeys')}>{status.examKeyCount}</PropertyRow>
            <PropertyRow label={t('admin.cache.colResultKeys')}>{status.resultKeyCount}</PropertyRow>
            <PropertyRow label={t('admin.cache.colTotalKeys')}>{status.totalKeyCount}</PropertyRow>
          </>
        )}
      </AdminStatusPanel>

      {/* ── Key list ── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">{t('admin.cache.keysTitle')}</h2>

        <div className="mb-2 flex flex-col gap-1.5">
          <label htmlFor="cache-pattern" className="text-xs font-medium text-muted-foreground">
            {t('admin.cache.filterPatternLabel')}
          </label>
          <input
            id="cache-pattern"
            type="text"
            value={patternInput}
            onChange={(e) => {
              handlePatternChange(e.target.value);
            }}
            placeholder={t('admin.cache.filterPatternPlaceholder')}
            className="h-9 w-72 rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{t('admin.cache.filterPatternHint')}</p>
        </div>

        {keysLoad === 'loading' && <LoadingState label={t('admin.cache.keysLoading')} />}

        {keysLoad === 'outOfScope' && <NotFoundState label={keysError ?? ''} />}

        {keysLoad === 'error' && (
          <ErrorState
            label={t('admin.cache.keysLoadError')}
            onRetry={() => void loadKeys(page)}
            retryLabel={t('common.retry')}
          />
        )}

        {keysLoad === 'loaded' && keys && keys.keys.length === 0 && (
          <BaseEmptyState label={t('admin.cache.keysEmpty')} />
        )}

        {keysLoad === 'loaded' && keys && keys.keys.length > 0 && (
          <>
            <div className="mt-2 overflow-x-auto">
              <table className="admin-table w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                      {t('admin.cache.colKey')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                      {t('admin.cache.colTtl')}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground">
                      {t('admin.rows.colActions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keys.keys.map((entry) => (
                    <Fragment key={entry.key}>
                      <tr className="transition-colors duration-100 hover:bg-muted/50">
                        <td className="px-4 py-2.5 font-mono text-xs text-foreground break-all">{entry.key}</td>
                        <td className="px-4 py-2.5 text-foreground tabular-nums">
                          {entry.ttl >= 0 ? t('admin.cache.ttlSeconds', { count: entry.ttl }) : t('admin.cache.ttlNoExpiry')}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => void toggleInspect(entry.key)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                              aria-expanded={expandedKey === entry.key}
                            >
                              {expandedKey === entry.key ? (
                                <ChevronUp className="size-3" aria-hidden />
                              ) : (
                                <ChevronDown className="size-3" aria-hidden />
                              )}
                              {t('admin.cache.inspectAction')}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setInvalidateKey(entry.key);
                              }}
                              className="text-xs font-medium text-destructive hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                            >
                              {t('admin.cache.invalidateAction')}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {expandedKey === entry.key && (
                        <tr>
                          <td colSpan={3} className="bg-muted/30 px-4 py-3">
                            {inspectLoad === 'loading' && (
                              <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
                                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                                {t('admin.cache.inspectLoading')}
                              </p>
                            )}
                            {inspectLoad === 'notFound' && (
                              <p role="alert" className="text-xs text-status-fail-fg">
                                {t('admin.cache.inspectNotFound')}
                              </p>
                            )}
                            {inspectLoad === 'error' && (
                              <p role="alert" className="text-xs text-status-fail-fg">
                                {t('admin.cache.inspectError')}
                              </p>
                            )}
                            {inspectLoad === 'loaded' && inspectResult && (
                              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-xs text-foreground">
                                {JSON.stringify(inspectResult.value, null, 2)}
                              </pre>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              total={keys.total}
              onPageChange={setPage}
              prevLabel={t('admin.rows.prevPage')}
              nextLabel={t('admin.rows.nextPage')}
              pageInfoLabel={t('admin.rows.pageInfo', { page, totalPages })}
              totalLabel={t('admin.cache.totalKeysFiltered', { count: keys.total })}
            />
          </>
        )}
      </div>

      <InvalidateCacheKeyDialog
        cacheKey={invalidateKey}
        onClose={() => {
          setInvalidateKey(null);
        }}
        onInvalidated={() => {
          setInvalidateKey(null);
          setExpandedKey(null);
          void loadStatus();
          void loadKeys(page);
        }}
      />

      <FlushCacheDialog
        open={flushOpen}
        pattern={pattern}
        onClose={() => {
          setFlushOpen(false);
        }}
        onFlushed={(result) => {
          setFlushOpen(false);
          setFlushNotice(result.deletedCount);
          setExpandedKey(null);
          void loadStatus();
          void loadKeys(1);
          setPage(1);
        }}
      />
    </section>
  );
}
