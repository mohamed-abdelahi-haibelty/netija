'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { ImportAttemptsDeleteResult } from 'shared';

export interface DeleteAttemptsTarget {
  importId: number;
  attemptIds: number[];
}

interface DeleteAttemptsDialogProps {
  target: DeleteAttemptsTarget | null;
  onClose: () => void;
  onDeleted: (result: ImportAttemptsDeleteResult) => void;
}

// A plain Confirm/Cancel dialog, like CancelImportDialog — deliberately
// lighter than DeleteImportDialog's type-to-confirm gate. Deleting a
// handful of rows within an import doesn't carry the same blast radius as
// deleting an entire import (the file that produced these rows is kept, so
// they're recoverable by re-running the import); a single confirmation
// click that states exactly how many rows will be removed is enough
// friction (task 033: "requires confirmation; shows how many rows will be
// deleted").
export function DeleteAttemptsDialog({ target, onClose, onDeleted }: DeleteAttemptsDialogProps) {
  const { t } = useTranslation();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (target) {
      setError(null);
      confirmRef.current?.focus();
    }
  }, [target]);

  if (!target) return null;

  const count = target.attemptIds.length;
  const isSingle = count === 1;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !deleting) onClose();
  };

  const handleConfirm = async () => {
    if (deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const result = await apiRequest<ImportAttemptsDeleteResult>(
        `/api/imports/${String(target.importId)}/attempts`,
        {
          method: 'DELETE',
          credentials: 'include',
          body: JSON.stringify({ attemptIds: target.attemptIds }),
        },
      );
      onDeleted(result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.rows.deleteDialogError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => {
        if (!deleting) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-attempts-title"
        aria-describedby="delete-attempts-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="delete-attempts-title" className="text-sm font-semibold text-foreground">
          {isSingle ? t('admin.rows.deleteDialogTitleSingle') : t('admin.rows.deleteDialogTitleBulk', { count })}
        </h2>
        <p id="delete-attempts-body" className="mt-2 text-sm text-muted-foreground">
          {isSingle ? t('admin.rows.deleteDialogBodySingle') : t('admin.rows.deleteDialogBodyBulk', { count })}
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
            disabled={deleting}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {t('admin.rows.deleteDialogCancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={deleting}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-destructive/10 text-destructive text-sm font-medium',
              'hover:bg-destructive/20 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('admin.rows.deleteDialogConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
