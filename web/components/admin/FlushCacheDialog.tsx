'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { CacheFlushResult } from 'shared';

interface FlushCacheDialogProps {
  open: boolean;
  pattern?: string;
  onClose: () => void;
  onFlushed: (result: CacheFlushResult) => void;
}

// A plain Confirm/Cancel dialog, like ReindexDialog/InvalidateCacheKeyDialog —
// flushing only ever clears rebuildable derived cache entries, never the
// source of truth. When a pattern filter is active on the page, flushing
// clears only the matching keys; with no filter, it clears the whole result
// cache (task 035: "invalidate cache — either a specific key, all result
// keys, or by pattern" — this dialog covers the latter two).
export function FlushCacheDialog({ open, pattern, onClose, onFlushed }: FlushCacheDialogProps) {
  const { t } = useTranslation();
  const [flushing, setFlushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      confirmRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !flushing) onClose();
  };

  const handleConfirm = async () => {
    if (flushing) return;
    setFlushing(true);
    setError(null);
    try {
      const result = await apiRequest<CacheFlushResult>('/api/cache/flush', {
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify(pattern ? { pattern } : {}),
      });
      onFlushed(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.cache.flushError'));
    } finally {
      setFlushing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => {
        if (!flushing) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="flush-cache-title"
        aria-describedby="flush-cache-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="flush-cache-title" className="text-sm font-semibold text-foreground">
          {t('admin.cache.flushDialogTitle')}
        </h2>
        <p id="flush-cache-body" className="mt-2 text-sm text-muted-foreground">
          {pattern
            ? t('admin.cache.flushDialogBodyPattern', { pattern })
            : t('admin.cache.flushDialogBodyAll')}
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
            disabled={flushing}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {t('admin.cache.flushDialogCancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={flushing}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-destructive/10 text-destructive text-sm font-medium',
              'hover:bg-destructive/20 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {flushing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('admin.cache.flushDialogConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
