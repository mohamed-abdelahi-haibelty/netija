'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { CacheInvalidateResult } from 'shared';

interface InvalidateCacheKeyDialogProps {
  cacheKey: string | null;
  onClose: () => void;
  onInvalidated: (key: string) => void;
}

// A plain Confirm/Cancel dialog, like CancelImportDialog/ReindexDialog —
// invalidating one cache entry only ever removes rebuildable derived data
// (architecture.md invariant 6: Redis is never a source of truth), so a
// single confirmation click is enough friction; the next read simply
// rebuilds it from Postgres.
export function InvalidateCacheKeyDialog({ cacheKey, onClose, onInvalidated }: InvalidateCacheKeyDialogProps) {
  const { t } = useTranslation();
  const [invalidating, setInvalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (cacheKey !== null) {
      setError(null);
      confirmRef.current?.focus();
    }
  }, [cacheKey]);

  if (cacheKey === null) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !invalidating) onClose();
  };

  const handleConfirm = async () => {
    if (invalidating) return;
    setInvalidating(true);
    setError(null);
    try {
      await apiRequest<CacheInvalidateResult>(`/api/cache/keys/${encodeURIComponent(cacheKey)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      onInvalidated(cacheKey);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.cache.invalidateError'));
    } finally {
      setInvalidating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => {
        if (!invalidating) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="invalidate-cache-key-title"
        aria-describedby="invalidate-cache-key-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="invalidate-cache-key-title" className="text-sm font-semibold text-foreground">
          {t('admin.cache.invalidateDialogTitle')}
        </h2>
        <p id="invalidate-cache-key-body" className="mt-2 text-sm text-muted-foreground">
          {t('admin.cache.invalidateDialogBody', { key: cacheKey })}
        </p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-fail-fg">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={invalidating}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {t('admin.cache.invalidateDialogCancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={invalidating}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-destructive/10 text-destructive text-sm font-medium',
              'hover:bg-destructive/20 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {invalidating && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('admin.cache.invalidateDialogConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
