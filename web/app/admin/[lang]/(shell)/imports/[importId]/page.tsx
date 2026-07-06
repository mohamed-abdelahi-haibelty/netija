'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Ban, ChevronLeft, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import { trackPublish } from '@/lib/analytics';
import { PropertyRow } from '@/components/PropertyRow';
import { DeleteImportDialog, type DeleteImportTarget } from '@/components/admin/DeleteImportDialog';
import { CancelImportDialog, type CancelImportTarget } from '@/components/admin/CancelImportDialog';
import type { ImportCancelResult, ImportPublishResult, ImportStatusResult } from 'shared';

type LoadStatus = 'loading' | 'loaded' | 'notFound' | 'error';

export default function ImportDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const rawParams = useParams();
  const lang = rawParams.lang as string;
  const importId = rawParams.importId as string;

  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [status, setStatus] = useState<ImportStatusResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteImportTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<CancelImportTarget | null>(null);
  // flipPublish is memoized without `status` in its deps (it only needs
  // functional setState below), so it reads the latest status through this
  // ref instead of risking a stale closure over the state value itself.
  const statusRef = useRef<ImportStatusResult | null>(null);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const load = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const data = await apiRequest<ImportStatusResult>(
        `/api/imports/${importId}/status`,
        {
          credentials: 'include',
        },
      );
      setStatus(data);
      setLoadStatus('loaded');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'IMPORT_NOT_FOUND') {
        setLoadStatus('notFound');
      } else {
        setLoadStatus('error');
      }
    }
  }, [importId]);

  useEffect(() => {
    void load();
  }, [load]);

  const flipPublish = useCallback(
    async (action: 'publish' | 'unpublish') => {
      setPublishing(true);
      setPublishError(null);
      try {
        const result = await apiRequest<ImportPublishResult>(
          `/api/imports/${importId}/${action}`,
          {
            method: 'POST',
            credentials: 'include',
          },
        );
        // Best-effort: purge the home page's ISR cache for the published
        // years list, which lives in this Next.js process and is invisible
        // to the api's own Redis invalidation (see the route handler for
        // why). A failure here shouldn't fail the publish/unpublish itself.
        await fetch('/api/internal/revalidate-published-years', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);
        // Only the agreed 'publish' event is tracked — unpublish is an
        // admin reversal, not part of the analytics plan's event set.
        if (action === 'publish' && statusRef.current?.examYear != null) {
          trackPublish({
            examYear: statusRef.current.examYear,
            attemptCount: statusRef.current.summary?.inserted ?? 0,
          });
        }
        setStatus((prev) =>
          prev ? { ...prev, published: result.published } : prev,
        );
      } catch (err) {
        setPublishError(
          err instanceof ApiClientError
            ? err.message
            : t(
                action === 'publish'
                  ? 'admin.publish.publishError'
                  : 'admin.publish.unpublishError',
              ),
        );
      } finally {
        setPublishing(false);
      }
    },
    [importId, t],
  );

  const canPublish =
    status?.status === 'completed' &&
    status.smokePassed === true &&
    !status.published;
  const smokeBlocked =
    status?.status === 'completed' &&
    status.smokePassed !== true &&
    !status.published;

  return (
    <section aria-labelledby="publish-title">
      <a
        href={`/admin/${lang}/imports`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 mb-5"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {t('admin.imports.pageTitle')}
      </a>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1
            id="publish-title"
            className="text-lg font-semibold text-foreground tracking-tight"
          >
            {t('admin.publish.pageTitle')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('admin.publish.subtitle')}
          </p>
        </div>
        {loadStatus === 'loaded' && (
          <button
            type="button"
            onClick={() => void load()}
            aria-label={t('admin.publish.refresh')}
            className={cn(
              'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium',
              'border border-border text-muted-foreground',
              'hover:bg-muted hover:text-foreground transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <RefreshCw className="size-3.5" aria-hidden />
            {t('admin.publish.refresh')}
          </button>
        )}
      </div>

      {loadStatus === 'loading' && (
        <p
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t('admin.publish.loading')}
        </p>
      )}

      {loadStatus === 'notFound' && (
        <p role="alert" className="text-sm text-status-fail-fg">
          {t('admin.publish.notFound')}
        </p>
      )}

      {loadStatus === 'error' && (
        <div
          role="alert"
          className="flex flex-col items-start gap-2 text-sm text-status-fail-fg"
        >
          <p>{t('admin.publish.loadError')}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-sm text-primary underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      )}

      {loadStatus === 'loaded' && status && (
        <>
          <div className="border-t border-border pt-1 mb-6">
            <PropertyRow label={t('admin.imports.colYear')}>
              {status.examYear ?? '—'}
            </PropertyRow>
            <PropertyRow label={t('admin.imports.colStatus')}>
              {t(`admin.publish.status${capitalize(status.status)}`)}
            </PropertyRow>
            {status.status === 'processing' && status.progress !== null && (
              <PropertyRow label={t('admin.imports.colProgress')}>
                {status.progress}%
              </PropertyRow>
            )}
            {status.summary && (
              <PropertyRow label={t('admin.imports.colSummary')}>
                {t('admin.imports.summaryInserted', {
                  count: status.summary.inserted,
                })}
                {' · '}
                {t('admin.imports.summaryRejected', {
                  count: status.summary.rejected,
                })}
              </PropertyRow>
            )}
            {status.failureReason && (
              <PropertyRow label={t('admin.publish.failureReasonLabel')}>
                <span className="text-status-fail-fg">
                  {status.failureReason}
                </span>
              </PropertyRow>
            )}
            <PropertyRow label={t('admin.imports.colSmoke')}>
              {status.smokePassed === true && (
                <span className="text-status-pass-fg font-medium">
                  {t('admin.imports.smokePassed')}
                </span>
              )}
              {status.smokePassed === false && (
                <span className="text-status-fail-fg font-medium">
                  {t('admin.imports.smokeFailed')}
                </span>
              )}
              {status.smokePassed === null && (
                <span className="text-muted-foreground">
                  {t('admin.imports.smokeNone')}
                </span>
              )}
            </PropertyRow>
            <PropertyRow label={t('admin.imports.colPublished')}>
              <span
                className={cn(
                  'font-medium',
                  status.published
                    ? 'text-status-pass-fg'
                    : 'text-muted-foreground',
                )}
              >
                {status.published
                  ? t('admin.imports.publishedYes')
                  : t('admin.imports.publishedNo')}
              </span>
            </PropertyRow>
          </div>

          {status.status === 'completed' && (
            <div className="flex flex-col items-start gap-3">
              {publishError && (
                <p role="alert" className="text-sm text-status-fail-fg">
                  {publishError}
                </p>
              )}

              {status.published ? (
                <button
                  type="button"
                  onClick={() => void flipPublish('unpublish')}
                  disabled={publishing}
                  className={cn(
                    'inline-flex items-center gap-2 h-10 px-5 rounded-md',
                    'border border-border text-foreground text-sm font-medium',
                    'hover:bg-muted transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    'disabled:pointer-events-none disabled:opacity-50',
                  )}
                >
                  {publishing && (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  )}
                  {t('admin.publish.unpublishButton')}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void flipPublish('publish')}
                    disabled={!canPublish || publishing}
                    aria-describedby={
                      smokeBlocked ? 'publish-blocked-note' : undefined
                    }
                    className={cn(
                      'inline-flex items-center gap-2 h-10 px-5 rounded-md',
                      'bg-primary text-primary-foreground text-sm font-medium',
                      'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      'disabled:pointer-events-none disabled:opacity-50',
                    )}
                  >
                    {publishing && (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    )}
                    {t('admin.publish.publishButton')}
                  </button>
                  {smokeBlocked && (
                    <p
                      id="publish-blocked-note"
                      className="text-sm text-muted-foreground"
                    >
                      {t('admin.publish.smokeBlockedNote')}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-border">
            {status.status === 'processing' && (
              <button
                type="button"
                onClick={() => {
                  setCancelTarget({ id: Number(importId), originalFilename: status.originalFilename });
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium',
                  'border border-border text-destructive',
                  'hover:bg-destructive/10 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <Ban className="size-3.5" aria-hidden />
                {t('admin.cancel.action')}
              </button>
            )}
            {status.status === 'cancelling' && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                {t('admin.cancel.cancellingNote')}
              </p>
            )}
            {status.status !== 'processing' && status.status !== 'cancelling' && (
              <button
                type="button"
                onClick={() => {
                  setDeleteTarget({
                    id: Number(importId),
                    originalFilename: status.originalFilename,
                    examYear: status.examYear,
                    attemptCount: status.summary?.inserted ?? 0,
                  });
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium',
                  'border border-border text-destructive',
                  'hover:bg-destructive/10 transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                <Trash2 className="size-3.5" aria-hidden />
                {t('admin.delete.action')}
              </button>
            )}
          </div>
        </>
      )}

      <DeleteImportDialog
        target={deleteTarget}
        onClose={() => {
          setDeleteTarget(null);
        }}
        onDeleted={() => {
          setDeleteTarget(null);
          router.push(`/admin/${lang}/imports`);
        }}
      />

      <CancelImportDialog
        target={cancelTarget}
        onClose={() => {
          setCancelTarget(null);
        }}
        onCancelled={(_cancelledId, result: ImportCancelResult) => {
          setCancelTarget(null);
          setStatus((prev) => (prev ? { ...prev, status: result.status } : prev));
        }}
      />
    </section>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
