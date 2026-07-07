'use client';

import { Loader2 } from 'lucide-react';
import { InlineLink } from '@/components/ui/inline-link';

export type LoadStatus = 'loading' | 'loaded' | 'error';
export type ExtendedLoadStatus = LoadStatus | 'notFound' | 'outOfScope';

export function LoadingState({ label }: { label: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </p>
  );
}

export function ErrorState({ label, onRetry, retryLabel }: { label: string; onRetry?: () => void; retryLabel?: string }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2 text-sm text-status-fail-fg">
      <p>{label}</p>
      {onRetry && (
        <InlineLink onClick={onRetry}>
          {retryLabel ?? 'Retry'}
        </InlineLink>
      )}
    </div>
  );
}

export function EmptyState({ label }: { label: string }) {
  return (
    <div className="border-t border-border py-16 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function NotFoundState({ label }: { label: string }) {
  return (
    <p role="alert" className="text-sm text-status-fail-fg">
      {label}
    </p>
  );
}
