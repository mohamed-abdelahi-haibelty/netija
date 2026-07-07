'use client';

import { useTranslation } from 'react-i18next';
import { ApiClientError, apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

// A plain Confirm/Cancel dialog wrapper — deleting rows within an import
// doesn't carry the same blast radius as deleting an entire import, so
// a single confirmation is enough friction.
export function DeleteAttemptsDialog({ target, onClose, onDeleted }: DeleteAttemptsDialogProps) {
  const { t } = useTranslation();

  if (!target) return null;

  const count = target.attemptIds.length;
  const isSingle = count === 1;

  return (
    <ConfirmDialog
      open={!!target}
      title={isSingle ? t('admin.rows.deleteDialogTitleSingle') : t('admin.rows.deleteDialogTitleBulk', { count })}
      body={isSingle ? t('admin.rows.deleteDialogBodySingle') : t('admin.rows.deleteDialogBodyBulk', { count })}
      confirmLabel={t('admin.rows.deleteDialogConfirm')}
      cancelLabel={t('admin.rows.deleteDialogCancel')}
      variant="destructive"
      onConfirm={async () => {
        const result = await apiRequest<ImportAttemptsDeleteResult>(
          `/api/imports/${String(target.importId)}/attempts`,
          {
            method: 'DELETE',
            credentials: 'include',
            body: JSON.stringify({ attemptIds: target.attemptIds }),
          },
        );
        onDeleted(result);
      }}
      onCancel={onClose}
    />
  );
}
