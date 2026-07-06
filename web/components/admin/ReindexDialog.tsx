'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { SearchIndexReindexResult } from 'shared';

interface ReindexDialogProps {
  open: boolean;
  onClose: () => void;
  onReindexed: (result: SearchIndexReindexResult) => void;
}

// A plain Confirm/Dismiss dialog, like CancelImportDialog — a full reindex
// only ever rebuilds derived, rebuildable data from Postgres (architecture.md
// invariant 6), so it carries no permanent-data-loss risk worth a
// type-to-confirm gate. The request can take a moment against a large
// dataset (task 034: "reindex can be heavy"); the confirm button stays
// disabled with a spinner for the single request/response round trip rather
// than polling a background job, matching how publish/unpublish/delete
// already run buildNameIndex synchronously.
export function ReindexDialog({ open, onClose, onReindexed }: ReindexDialogProps) {
  const { t } = useTranslation();
  const [reindexing, setReindexing] = useState(false);
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
    if (e.key === 'Escape' && !reindexing) onClose();
  };

  const handleConfirm = async () => {
    if (reindexing) return;
    setReindexing(true);
    setError(null);
    try {
      const result = await apiRequest<SearchIndexReindexResult>('/api/search-index/reindex', {
        method: 'POST',
        credentials: 'include',
      });
      onReindexed(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.searchIndex.reindexError'));
    } finally {
      setReindexing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => {
        if (!reindexing) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reindex-title"
        aria-describedby="reindex-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="reindex-title" className="text-sm font-semibold text-foreground">
          {t('admin.searchIndex.reindexDialogTitle')}
        </h2>
        <p id="reindex-body" className="mt-2 text-sm text-muted-foreground">
          {t('admin.searchIndex.reindexDialogBody')}
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
            disabled={reindexing}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {t('admin.searchIndex.reindexDismiss')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={reindexing}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-primary text-primary-foreground text-sm font-medium',
              'hover:bg-primary/85 active:bg-primary/70 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {reindexing && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {reindexing
              ? t('admin.searchIndex.reindexInProgress')
              : t('admin.searchIndex.reindexConfirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
