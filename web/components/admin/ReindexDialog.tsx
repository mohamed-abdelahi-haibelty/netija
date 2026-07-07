'use client';

import { useTranslation } from 'react-i18next';
import { ApiClientError, apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { SearchIndexReindexResult } from 'shared';

interface ReindexDialogProps {
  open: boolean;
  onClose: () => void;
  onReindexed: (result: SearchIndexReindexResult) => void;
}

// A plain Confirm/Dismiss dialog wrapper — a full reindex only ever
// rebuilds derived, rebuildable data from Postgres, so it carries no
// permanent-data-loss risk.
export function ReindexDialog({ open, onClose, onReindexed }: ReindexDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      title={t('admin.searchIndex.reindexDialogTitle')}
      body={t('admin.searchIndex.reindexDialogBody')}
      confirmLabel={t('admin.searchIndex.reindexConfirmButton')}
      cancelLabel={t('admin.searchIndex.reindexDismiss')}
      variant="primary"
      onConfirm={async () => {
        const result = await apiRequest<SearchIndexReindexResult>('/api/search-index/reindex', {
          method: 'POST',
          credentials: 'include',
        });
        onReindexed(result);
      }}
      onCancel={onClose}
    />
  );
}
