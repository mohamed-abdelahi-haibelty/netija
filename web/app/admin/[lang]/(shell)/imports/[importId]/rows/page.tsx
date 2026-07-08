'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import { useDebouncedSetter } from '@/lib/useDebouncedSetter';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DeleteAttemptsDialog, type DeleteAttemptsTarget } from '@/components/admin/DeleteAttemptsDialog';
import { DECISIONS } from 'shared';
import type { ImportAttemptsListResult } from 'shared';
import { PageHeader } from '@/components/ui/page-header';
import { BackLink } from '@/components/ui/back-link';
import { Pagination } from '@/components/ui/pagination';
import { LoadingState, ErrorState, NotFoundState, EmptyState as BaseEmptyState } from '@/components/ui/load-states';

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const ALL_SERIES = 'all';
const ALL_DECISIONS = 'all';

// Zod's decisionEnum values contain accented characters, so translation
// keys can't be derived from them directly — this is the single mapping
// between a stored decision value and its i18n key.
const DECISION_LABEL_KEY: Record<string, string> = {
  Admis: 'decisionAdmis',
  Ajourné: 'decisionAjourne',
  Sessionnaire: 'decisionSessionnaire',
  Absent: 'decisionAbsent',
  Délibérable: 'decisionDeliberable',
  Annulé: 'decisionAnnule',
};

type LoadStatus = 'loading' | 'loaded' | 'notFound' | 'error';

export default function ImportRowsPage() {
  const { t } = useTranslation();
  const rawParams = useParams();
  const lang = rawParams.lang as string;
  const importId = rawParams.importId as string;

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [result, setResult] = useState<ImportAttemptsListResult | null>(null);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [serie, setSerie] = useState(ALL_SERIES);
  const [decision, setDecision] = useState(ALL_DECISIONS);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<DeleteAttemptsTarget | null>(null);
  const debounce = useDebouncedSetter(SEARCH_DEBOUNCE_MS);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoadStatus('loading');
      try {
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('pageSize', String(PAGE_SIZE));
        if (search) params.set('search', search);
        if (serie !== ALL_SERIES) params.set('serie', serie);
        if (decision !== ALL_DECISIONS) params.set('decision', decision);

        const data = await apiRequest<ImportAttemptsListResult>(
          `/api/imports/${importId}/attempts?${params.toString()}`,
          { credentials: 'include' },
        );
        // An in-range page can go stale after a delete shrinks the result
        // set (e.g. deleting the only row on the last page) — step back one
        // page and reload rather than showing a page that's now empty.
        if (data.rows.length === 0 && data.total > 0 && targetPage > 1) {
          setPage(targetPage - 1);
          return;
        }
        setResult(data);
        setSelectedIds(new Set());
        setLoadStatus('loaded');
      } catch (err) {
        if (err instanceof ApiClientError && err.code === 'IMPORT_NOT_FOUND') {
          setLoadStatus('notFound');
        } else {
          setLoadStatus('error');
        }
      }
    },
    [importId, search, serie, decision],
  );

  useEffect(() => {
    void load(page);
  }, [load, page]);

  useEffect(() => {
    if (!selectAllRef.current || !result) return;
    const allSelected = result.rows.length > 0 && result.rows.every((r) => selectedIds.has(r.id));
    const someSelected = result.rows.some((r) => selectedIds.has(r.id));
    selectAllRef.current.indeterminate = someSelected && !allSelected;
  }, [result, selectedIds]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debounce(() => {
      setPage(1);
      setSearch(value.trim());
    });
  };

  const toggleRow = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    if (!result) return;
    const allSelected = result.rows.every((r) => selectedIds.has(r.id));
    setSelectedIds(allSelected ? new Set() : new Set(result.rows.map((r) => r.id)));
  };

  const totalPages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  return (
    <section aria-labelledby="rows-title">
      <BackLink
        href={`/admin/${lang}/imports/${importId}`}
        label={t('admin.rows.backToImport')}
      />

      <PageHeader
        title={t('admin.rows.pageTitle')}
        subtitle={t('admin.rows.subtitle')}
      />

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rows-search" className="text-xs font-medium text-muted-foreground">
            {t('admin.rows.searchLabel')}
          </label>
          <input
            id="rows-search"
            type="text"
            value={searchInput}
            onChange={(e) => {
              handleSearchChange(e.target.value);
            }}
            placeholder={t('admin.rows.searchPlaceholder')}
            className="h-9 w-64 rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rows-filter-serie" className="text-xs font-medium text-muted-foreground">
            {t('admin.rows.filterSerieLabel')}
          </label>
          <Select
            value={serie}
            onValueChange={(v) => {
              if (!v) return;
              setPage(1);
              setSerie(v);
            }}
          >
            <SelectTrigger id="rows-filter-serie" className="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SERIES}>{t('admin.rows.filterSerieAll')}</SelectItem>
              {(result?.availableSeries ?? []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rows-filter-decision" className="text-xs font-medium text-muted-foreground">
            {t('admin.rows.filterDecisionLabel')}
          </label>
          <Select
            value={decision}
            onValueChange={(v) => {
              if (!v) return;
              setPage(1);
              setDecision(v);
            }}
          >
            <SelectTrigger id="rows-filter-decision" className="w-44 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_DECISIONS}>{t('admin.rows.filterDecisionAll')}</SelectItem>
              {DECISIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {t(`admin.rows.${DECISION_LABEL_KEY[d]}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="ms-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {t('admin.rows.selectedCount', { count: selectedIds.size })}
            </span>
            <button
              type="button"
              onClick={() => {
                setDeleteTarget({ importId: Number(importId), attemptIds: [...selectedIds] });
              }}
              className={cn(
                'inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium',
                'border border-border text-destructive',
                'hover:bg-destructive/10 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Trash2 className="size-3.5" aria-hidden />
              {t('admin.rows.deleteSelected')}
            </button>
          </div>
        )}
      </div>

      {loadStatus === 'loading' && <LoadingState label={t('admin.rows.loading')} />}

      {loadStatus === 'notFound' && <NotFoundState label={t('admin.rows.notFound')} />}

      {loadStatus === 'error' && (
        <ErrorState
          label={t('admin.rows.loadError')}
          onRetry={() => void load(page)}
          retryLabel={t('common.retry')}
        />
      )}

      {loadStatus === 'loaded' && result && result.rows.length === 0 && (
        <BaseEmptyState label={t('admin.rows.empty')} />
      )}

      {loadStatus === 'loaded' && result && result.rows.length > 0 && (
        <>
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={result.rows.every((r) => selectedIds.has(r.id))}
                      onChange={toggleAllOnPage}
                      aria-label={t('admin.rows.selectAll')}
                      className="size-4"
                    />
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colExamNo')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colName')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colSerie')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colMoyenne')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colDecision')}
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-end font-medium text-muted-foreground whitespace-nowrap">
                    {t('admin.rows.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.rows.map((row) => (
                  <tr key={row.id} className="transition-colors duration-100 hover:bg-muted/50">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => {
                          toggleRow(row.id);
                        }}
                        aria-label={t('admin.rows.selectRow', { examNo: row.examNo })}
                        className="size-4"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{row.examNo}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col gap-0.5">
                        {row.nameFr && <span lang="fr">{row.nameFr}</span>}
                        {row.nameAr && (
                          <span lang="ar" dir="rtl">
                            {row.nameAr}
                          </span>
                        )}
                        {!row.nameFr && !row.nameAr && <span className="text-muted-foreground">—</span>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-foreground">{row.serie}</td>
                    <td className="px-4 py-2.5 text-foreground tabular-nums">{row.moyenne ?? '—'}</td>
                    <td className="px-4 py-2.5 text-foreground">
                      {DECISION_LABEL_KEY[row.decision]
                        ? t(`admin.rows.${DECISION_LABEL_KEY[row.decision]}`)
                        : row.decision}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget({ importId: Number(importId), attemptIds: [row.id] });
                          }}
                          aria-label={`${t('admin.rows.deleteRow')} ${row.examNo}`}
                          className={cn(
                            'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                            'border border-border text-destructive',
                            'hover:bg-destructive/10 transition-colors duration-150',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                        >
                          <Trash2 className="size-3" aria-hidden />
                          {t('admin.rows.deleteRow')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
            prevLabel={t('admin.rows.prevPage')}
            nextLabel={t('admin.rows.nextPage')}
            pageInfoLabel={t('admin.rows.pageInfo', { page, totalPages })}
            totalLabel={t('admin.rows.totalRows', { count: result.total })}
          />
        </>
      )}

      <DeleteAttemptsDialog
        target={deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
        }}
        onDeleted={() => {
          setDeleteTarget(null);
          void load(page);
        }}
      />
    </section>
  );
}
