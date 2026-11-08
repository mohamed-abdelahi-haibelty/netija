'use client';

import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

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
// before an irreversible action fires.
export function DeleteImportDialog({ target, onClose, onDeleted }: DeleteImportDialogProps) {
  const { t } = useTranslation();

  if (!target) return null;

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
    <ConfirmDialog
      open={!!target}
      title={t('admin.delete.dialogTitle')}
      body={body}
      confirmLabel={t('admin.delete.confirmButton')}
      cancelLabel={t('admin.delete.cancel')}
      variant="destructive"
      confirmText={target.originalFilename}
      confirmInputLabel={t('admin.delete.confirmLabel', { filename: target.originalFilename })}
      onConfirm={async () => {
        await apiRequest(`/api/imports/${String(target.id)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        onDeleted(target.id);
      }}
      onCancel={onClose}
    />
  );
}
