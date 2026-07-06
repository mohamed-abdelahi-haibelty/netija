'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';
import type { ImportCancelResult } from 'shared';

export interface CancelImportTarget {
  id: number;
  originalFilename: string;
}

interface CancelImportDialogProps {
  target: CancelImportTarget | null;
  onClose: () => void;
  onCancelled: (importId: number, result: ImportCancelResult) => void;
}

// A plain Confirm/Cancel dialog, deliberately lighter than
// DeleteImportDialog's type-to-confirm gate — cancelling a stuck import
// isn't a permanent data-loss action the way deleting one is (task 031's
// original file is untouched either way, and nothing durable was
// committed for a cancelled run — see loader.py's rollback guarantee), so
// a single confirmation click is enough friction for it.
export function CancelImportDialog({ target, onClose, onCancelled }: CancelImportDialogProps) {
  const { t } = useTranslation();
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (target) {
      setError(null);
      confirmRef.current?.focus();
    }
  }, [target]);

  if (!target) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !cancelling) onClose();
  };

  const handleConfirm = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      const result = await apiRequest<ImportCancelResult>(`/api/imports/${String(target.id)}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      onCancelled(target.id, result);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.cancel.error'));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => {
        if (!cancelling) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-import-title"
        aria-describedby="cancel-import-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="cancel-import-title" className="text-sm font-semibold text-foreground">
          {t('admin.cancel.dialogTitle')}
        </h2>
        <p id="cancel-import-body" className="mt-2 text-sm text-muted-foreground">
          {t('admin.cancel.dialogBody', { filename: target.originalFilename })}
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
            disabled={cancelling}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {t('admin.cancel.dismiss')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void handleConfirm()}
            disabled={cancelling}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-destructive/10 text-destructive text-sm font-medium',
              'hover:bg-destructive/20 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {cancelling && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('admin.cancel.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
