'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiClientError, apiRequest } from '@/lib/api';

export interface DeleteImportTarget {
  id: number;
  originalFilename: string;
  examYear: number | null;
  attemptCount: number;
}

interface DeleteImportDialogProps {
  target: DeleteImportTarget | null;
  onClose: () => void;
  onDeleted: (importId: number) => void;
}

// Type-to-confirm on the exact original filename — not a generic "DELETE"
// word — so the admin has to actually read which file they're removing
// before an irreversible action fires (project-overview.md: deletion has no
// undo; the uploaded Excel itself is kept, but every row it produced is gone).
export function DeleteImportDialog({ target, onClose, onDeleted }: DeleteImportDialogProps) {
  const { t } = useTranslation();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (target) {
      setConfirmText('');
      setError(null);
      inputRef.current?.focus();
    }
  }, [target]);

  if (!target) return null;

  const matches = confirmText === target.originalFilename;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !deleting) onClose();
  };

  const handleDelete = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await apiRequest(`/api/imports/${String(target.id)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      onDeleted(target.id);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : t('admin.delete.error'));
    } finally {
      setDeleting(false);
    }
  };

  const body =
    target.examYear !== null
      ? t('admin.delete.dialogBodyWithYear', {
          filename: target.originalFilename,
          year: target.examYear,
          count: target.attemptCount,
        })
      : t('admin.delete.dialogBody', {
          filename: target.originalFilename,
          count: target.attemptCount,
        });

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
        aria-labelledby="delete-import-title"
        aria-describedby="delete-import-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <h2 id="delete-import-title" className="text-sm font-semibold text-foreground">
          {t('admin.delete.dialogTitle')}
        </h2>
        <p id="delete-import-body" className="mt-2 text-sm text-muted-foreground">
          {body}
        </p>

        <label
          htmlFor="delete-confirm-input"
          className="mt-4 block text-xs font-medium text-muted-foreground"
        >
          {t('admin.delete.confirmLabel', { filename: target.originalFilename })}
        </label>
        <input
          ref={inputRef}
          id="delete-confirm-input"
          type="text"
          value={confirmText}
          onChange={(e) => {
            setConfirmText(e.target.value);
          }}
          disabled={deleting}
          autoComplete="off"
          className="mt-1.5 h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />

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
            {t('admin.delete.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={!matches || deleting}
            className={cn(
              'inline-flex items-center gap-2 h-9 px-4 rounded-md',
              'bg-destructive/10 text-destructive text-sm font-medium',
              'hover:bg-destructive/20 transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {deleting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {t('admin.delete.confirmButton')}
          </button>
        </div>
      </div>
    </div>
  );
}
