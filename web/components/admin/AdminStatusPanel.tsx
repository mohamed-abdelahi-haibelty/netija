'use client';

import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingState, ErrorState } from '@/components/ui/load-states';

interface AdminStatusPanelProps {
  title: string;
  refreshLabel: string;
  loadState: 'loading' | 'loaded' | 'error';
  loadingLabel: string;
  errorLabel: string;
  retryLabel: string;
  onRefresh: () => void;
  children: ReactNode;
}

// Shared by the cache and search-index admin pages: a titled panel with a
// refresh button (shown once loaded), a loading/error state, and the
// caller's own PropertyRow content once loaded.
export function AdminStatusPanel({
  title,
  refreshLabel,
  loadState,
  loadingLabel,
  errorLabel,
  retryLabel,
  onRefresh,
  children,
}: AdminStatusPanelProps) {
  return (
    <div className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {loadState === 'loaded' && (
          <button
            type="button"
            onClick={onRefresh}
            aria-label={refreshLabel}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium',
              'border border-border text-muted-foreground',
              'hover:bg-muted hover:text-foreground transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            )}
          >
            <RefreshCw className="size-3" aria-hidden />
            {refreshLabel}
          </button>
        )}
      </div>

      {loadState === 'loading' && <LoadingState label={loadingLabel} />}

      {loadState === 'error' && (
        <ErrorState label={errorLabel} onRetry={onRefresh} retryLabel={retryLabel} />
      )}

      {loadState === 'loaded' && <div className="border-t border-border pt-1">{children}</div>}
    </div>
  );
}
