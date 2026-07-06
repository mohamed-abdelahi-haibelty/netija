import { cn } from '@/lib/utils';
import type { ImportStatus } from 'shared';

export type { ImportStatus };

const STATUS_STYLES: Record<ImportStatus, string> = {
  pending: 'bg-status-neutral-bg  text-status-neutral-fg',
  processing: 'bg-secondary/15       text-secondary-foreground',
  cancelling: 'bg-secondary/15       text-secondary-foreground',
  completed: 'bg-status-pass-bg     text-status-pass-fg',
  cancelled: 'bg-status-neutral-bg  text-status-neutral-fg',
  failed: 'bg-status-fail-bg     text-status-fail-fg',
};

const STATUS_DOT: Record<ImportStatus, string> = {
  pending: 'bg-status-neutral-fg',
  processing: 'bg-secondary animate-pulse',
  cancelling: 'bg-secondary animate-pulse',
  completed: 'bg-status-pass-fg',
  cancelled: 'bg-status-neutral-fg',
  failed: 'bg-status-fail-fg',
};

interface ImportStatusBadgeProps {
  status: ImportStatus;
  label: string;
}

export function ImportStatusBadge({ status, label }: ImportStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status],
      )}
    >
      <span
        className={cn('size-1.5 rounded-full shrink-0', STATUS_DOT[status])}
        aria-hidden
      />
      {label}
    </span>
  );
}
