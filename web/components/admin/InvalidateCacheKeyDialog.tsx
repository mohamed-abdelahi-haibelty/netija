'use client';

import { useTranslation } from 'react-i18next';
import { apiRequest } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import type { CacheInvalidateResult } from 'shared';

interface InvalidateCacheKeyDialogProps {
  cacheKey: string | null;
  onClose: () => void;
  onInvalidated: (key: string) => void;
}

// A plain Confirm/Cancel dialog wrapper — invalidating one cache entry
// only ever removes rebuildable derived data.
export function InvalidateCacheKeyDialog({ cacheKey, onClose, onInvalidated }: InvalidateCacheKeyDialogProps) {
  const { t } = useTranslation();

  if (cacheKey === null) return null;

  return (
    <ConfirmDialog
      open={true}
      title={t('admin.cache.invalidateDialogTitle')}
      body={t('admin.cache.invalidateDialogBody', { key: cacheKey })}
      confirmLabel={t('admin.cache.invalidateDialogConfirm')}
      cancelLabel={t('admin.cache.invalidateDialogCancel')}
      variant="destructive"
      onConfirm={async () => {
        await apiRequest<CacheInvalidateResult>(`/api/cache/keys/${encodeURIComponent(cacheKey)}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        onInvalidated(cacheKey);
      }}
      onCancel={onClose}
    />
  );
}
