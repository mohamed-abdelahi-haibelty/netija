'use client';

import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { CacheFlushResult } from 'shared';

interface FlushCacheDialogProps {
  open: boolean;
  pattern?: string;
  onClose: () => void;
  onFlushed: (result: CacheFlushResult) => void;
}

// A plain Confirm/Cancel dialog wrapper — flushing only ever clears
// rebuildable derived cache entries, never the source of truth.
export function FlushCacheDialog({ open, pattern, onClose, onFlushed }: FlushCacheDialogProps) {
  const { t } = useTranslation();

  return (
    <ConfirmDialog
      open={open}
      title={t('admin.cache.flushDialogTitle')}
      body={pattern
        ? t('admin.cache.flushDialogBodyPattern', { pattern })
        : t('admin.cache.flushDialogBodyAll')}
      confirmLabel={t('admin.cache.flushDialogConfirm')}
      cancelLabel={t('admin.cache.flushDialogCancel')}
      variant="destructive"
      onConfirm={async () => {
        const result = await apiRequest<CacheFlushResult>('/api/cache/flush', {
          method: 'POST',
          credentials: 'include',
          body: JSON.stringify(pattern ? { pattern } : {}),
        });
        onFlushed(result);
      }}
      onCancel={onClose}
    />
  );
}
