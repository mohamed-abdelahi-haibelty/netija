'use client';

import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
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

// A plain Confirm/Cancel dialog wrapper — cancelling a stuck import
// isn't a permanent data-loss action the way deleting one is, so
// a single confirmation click is enough friction for it.
export function CancelImportDialog({ target, onClose, onCancelled }: CancelImportDialogProps) {
  const { t } = useTranslation();

  if (!target) return null;

  return (
    <ConfirmDialog
      open={!!target}
      title={t('admin.cancel.dialogTitle')}
      body={t('admin.cancel.dialogBody', { filename: target.originalFilename })}
      confirmLabel={t('admin.cancel.confirmButton')}
      cancelLabel={t('admin.cancel.dismiss')}
      variant="destructive"
      onConfirm={async () => {
        const result = await apiRequest<ImportCancelResult>(`/api/imports/${String(target.id)}/cancel`, {
          method: 'POST',
          credentials: 'include',
        });
        onCancelled(target.id, result);
      }}
      onCancel={onClose}
    />
  );
}
