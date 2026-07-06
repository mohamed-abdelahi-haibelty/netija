'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Plus,
  Download,
  ChevronRight,
  AlertCircle,
  Loader2,
  Trash2,
  Ban,
} from 'lucide-react';
import { ApiClientError, apiRequest } from '@/lib/api';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import { cn } from '@/lib/utils';
import { trackUploadCompleted } from '@/lib/analytics';
import { DeleteImportDialog, type DeleteImportTarget } from '@/components/admin/DeleteImportDialog';
import { CancelImportDialog, type CancelImportTarget } from '@/components/admin/CancelImportDialog';
import type { ImportListItem } from 'shared';

// Polling interval while any import is still processing — the task spec
// allows polling in place of a push channel, and 3s keeps the dashboard
// feeling live during the results-day critical path without hammering the API.
const POLL_INTERVAL_MS = 3000;

type LoadStatus = 'loading' | 'loaded' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string, lang: string) {
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MR' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

function formatCount(n: number, lang: string) {
  return new Intl.NumberFormat(lang === 'ar' ? 'ar-MR' : 'fr-FR').format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImportRow({
  imp,
  lang,
  statusLabel,
  t,
  onDeleteRequest,
  onCancelRequest,
}: {
  imp: ImportListItem;
  lang: string;
  statusLabel: Record<ImportListItem['status'], string>;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onDeleteRequest: (target: DeleteImportTarget) => void;
  onCancelRequest: (target: CancelImportTarget) => void;
}) {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? '';

  return (
    <tr className="transition-colors duration-100 hover:bg-muted/50">
      {/* File + date */}
      <td className="px-4 py-3 max-w-55">
        <p
          className="font-medium text-foreground truncate"
          title={imp.originalFilename}
        >
          {imp.originalFilename}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
          {formatDate(imp.createdAt, lang)}
        </p>
      </td>

      {/* Year */}
      <td className="px-4 py-3 text-foreground tabular-nums">
        {imp.examYear ?? '—'}
      </td>

      {/* Status + progress */}
      <td className="px-4 py-3">
        <div className="flex flex-col gap-1.5">
          <ImportStatusBadge
            status={imp.status}
            label={statusLabel[imp.status]}
          />
          {imp.status === 'processing' && imp.progress != null && (
            <div className="flex items-center gap-2">
              <div
                className="relative h-1 w-24 rounded-full bg-border overflow-hidden"
                role="progressbar"
                aria-valuenow={imp.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${String(imp.progress)}%`}
              >
                <div
                  className="absolute inset-y-0 inset-s-0 bg-secondary rounded-full transition-all duration-500"
                  style={{ width: `${String(imp.progress)}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {imp.progress}%
              </span>
            </div>
          )}
          {imp.status === 'failed' && imp.failureReason && (
            <span className="inline-flex items-center gap-1 text-xs text-status-fail-fg">
              <AlertCircle className="size-3 shrink-0" aria-hidden />
              {imp.failureReason}
            </span>
          )}
        </div>
      </td>

      {/* Summary */}
      <td className="px-4 py-3">
        {imp.summary ? (
          <div className="flex flex-col gap-0.5 text-xs">
            <span className="text-foreground tabular-nums">
              {t('admin.imports.summaryInserted', {
                count: formatCount(imp.summary.inserted, lang),
              })}
            </span>
            <span className="text-muted-foreground tabular-nums">
              {t('admin.imports.summaryRejected', {
                count: formatCount(imp.summary.rejected, lang),
              })}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>

      {/* Smoke */}
      <td className="px-4 py-3">
        {imp.smokePassed === true && (
          <span className="text-xs font-medium text-status-pass-fg">
            {t('admin.imports.smokePassed')}
          </span>
        )}
        {imp.smokePassed === false && (
          <span className="text-xs font-medium text-status-fail-fg">
            {t('admin.imports.smokeFailed')}
          </span>
        )}
        {imp.smokePassed === null && (
          <span className="text-muted-foreground">
            {t('admin.imports.smokeNone')}
          </span>
        )}
      </td>

      {/* Published */}
      <td className="px-4 py-3">
        <span
          className={cn(
            'text-xs font-medium',
            imp.published ? 'text-status-pass-fg' : 'text-muted-foreground',
          )}
        >
          {imp.published
            ? t('admin.imports.publishedYes')
            : t('admin.imports.publishedNo')}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-2">
          {imp.summary && (
            <a
              href={`${apiBase}/api/imports/${String(imp.id)}/rejects`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              download
            >
              <Download className="size-3" aria-hidden />
              {t('admin.imports.downloadRejects')}
            </a>
          )}
          {imp.status === 'pending' && (
            <Link
              href={`/admin/${lang}/imports/${String(imp.id)}/mapping`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {t('admin.imports.openMapping')}
              <ChevronRight className="size-3" aria-hidden />
            </Link>
          )}
          {imp.status !== 'pending' && (
            <Link
              href={`/admin/${lang}/imports/${String(imp.id)}`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-muted-foreground',
                'hover:bg-muted hover:text-foreground transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              {t('admin.imports.viewDetails')}
              <ChevronRight className="size-3" aria-hidden />
            </Link>
          )}
          {imp.status === 'processing' && (
            <button
              type="button"
              onClick={() => {
                onCancelRequest({ id: imp.id, originalFilename: imp.originalFilename });
              }}
              aria-label={`${t('admin.cancel.action')} ${imp.originalFilename}`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-destructive',
                'hover:bg-destructive/10 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Ban className="size-3" aria-hidden />
              {t('admin.cancel.action')}
            </button>
          )}
          {/* Only allow deleting imports that are NOT currently processing
              or cancelling (a running import must be cancelled first, and
              a cancel in flight must finish — task 032). */}
          {imp.status !== 'processing' && imp.status !== 'cancelling' && (
            <button
              type="button"
              onClick={() => {
                onDeleteRequest({
                  id: imp.id,
                  originalFilename: imp.originalFilename,
                  examYear: imp.examYear,
                  attemptCount: imp.summary?.inserted ?? 0,
                });
              }}
              aria-label={`${t('admin.delete.action')} ${imp.originalFilename}`}
              className={cn(
                'inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium',
                'border border-border text-destructive',
                'hover:bg-destructive/10 transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
            >
              <Trash2 className="size-3" aria-hidden />
              {t('admin.delete.action')}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function EmptyState({ lang, t }: { lang: string; t: (key: string) => string }) {
  return (
    <div className="border-t border-border py-16 text-center">
      <p className="text-sm font-medium text-foreground mb-1">
        {t('admin.imports.empty')}
      </p>
      <p className="text-sm text-muted-foreground mb-4">
        {t('admin.imports.emptyBody')}
      </p>
      <Link
        href={`/admin/${lang}/imports/upload`}
        className="text-sm text-foreground underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
      >
        {t('admin.imports.newUpload')}
      </Link>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ImportsPage() {
  const { t } = useTranslation();
  const rawParams = useParams();
  const lang = rawParams.lang as string;

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [imports, setImports] = useState<ImportListItem[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<DeleteImportTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelImportTarget | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Tracks each import's last-seen status so a processing -> completed
  // transition can be reported to PostHog exactly once, while this
  // dashboard happens to be open and polling.
  const prevStatusesRef = useRef<Map<number, ImportListItem['status']>>(new Map());
  // Wall-clock time this dashboard first observed each import as
  // 'processing' — the only duration signal available client-side, since
  // the API doesn't expose a processing-started timestamp.
  const processingStartedAtRef = useRef<Map<number, number>>(new Map());

  const load = useCallback(async (background = false) => {
    if (!background) setLoadStatus('loading');
    try {
      const data = await apiRequest<ImportListItem[]>('/api/imports', {
        credentials: 'include',
      });
      for (const imp of data) {
        const prevStatus = prevStatusesRef.current.get(imp.id);
        if (prevStatus === 'processing' && imp.status === 'completed') {
          const startedAt = processingStartedAtRef.current.get(imp.id);
          trackUploadCompleted({
            rowCount: imp.summary
              ? imp.summary.inserted + imp.summary.rejected + imp.summary.duplicatesSkipped
              : 0,
            rejected: imp.summary?.rejected ?? 0,
            durationMs: startedAt !== undefined ? Date.now() - startedAt : 0,
          });
          processingStartedAtRef.current.delete(imp.id);
        } else if (imp.status === 'processing' && !processingStartedAtRef.current.has(imp.id)) {
          processingStartedAtRef.current.set(imp.id, Date.now());
        }
        prevStatusesRef.current.set(imp.id, imp.status);
      }
      setImports(data);
      setLoadStatus('loaded');
    } catch (err) {
      if (!background || !(err instanceof ApiClientError))
        setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Live progress while any import is still processing (polling, per the
  // task spec — no push channel exists). Stops itself once nothing is
  // in flight, so an idle dashboard doesn't keep polling forever.
  useEffect(() => {
    const hasProcessing = imports.some(
      (imp) => imp.status === 'processing' || imp.status === 'cancelling',
    );
    if (!hasProcessing) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return;
    pollRef.current = setInterval(() => void load(true), POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [imports, load]);

  const statusLabel: Record<ImportListItem['status'], string> = {
    pending: t('admin.imports.statusPending'),
    processing: t('admin.imports.statusProcessing'),
    cancelling: t('admin.imports.statusCancelling'),
    completed: t('admin.imports.statusCompleted'),
    cancelled: t('admin.imports.statusCancelled'),
    failed: t('admin.imports.statusFailed'),
  };

  return (
    <section aria-labelledby="imports-title">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <h1
          id="imports-title"
          className="text-lg font-semibold text-foreground tracking-tight"
        >
          {t('admin.imports.pageTitle')}
        </h1>
        <Link
          href={`/admin/${lang}/imports/upload`}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
            'bg-primary text-primary-foreground text-sm font-medium',
            'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        >
          <Plus className="size-3.5" aria-hidden />
          {t('admin.imports.newUpload')}
        </Link>
      </div>

      {loadStatus === 'loading' && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('admin.imports.loading')}
        </p>
      )}

      {loadStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 text-sm text-status-fail-fg"
        >
          <p>{t('admin.imports.loadError')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loadStatus === 'loaded' &&
        (imports.length === 0 ? (
          <EmptyState lang={lang} t={t} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t('admin.imports.colFile')}
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
                    {t('admin.imports.colStatus')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t('admin.imports.colSummary')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t('admin.imports.colSmoke')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-start font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t('admin.imports.colPublished')}
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-2.5 text-end font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {t('admin.imports.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {imports.map((imp) => (
                  <ImportRow
                    key={imp.id}
                    imp={imp}
                    lang={lang}
                    statusLabel={statusLabel}
                    t={t}
                    onDeleteRequest={setDeleteTarget}
                    onCancelRequest={setCancelTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <DeleteImportDialog
        target={deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
        }}
        onDeleted={(deletedId) => {
          setDeleteTarget(null);
          setImports((prev) => prev.filter((imp) => imp.id !== deletedId));
        }}
      />

      <CancelImportDialog
        target={cancelTarget}
        onClose={() => {
          setCancelTarget(null);
        }}
        onCancelled={(cancelledId, result) => {
          setCancelTarget(null);
          setImports((prev) =>
            prev.map((imp) => (imp.id === cancelledId ? { ...imp, status: result.status } : imp)),
          );
        }}
      />
    </section>
  );
}
