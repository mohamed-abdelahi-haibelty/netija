'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  prevLabel: string;
  nextLabel: string;
  pageInfoLabel: string;
  totalLabel: string;
}

const btnBase = cn(
  'inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium',
  'border border-border text-muted-foreground',
  'hover:bg-muted hover:text-foreground transition-colors duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
);

export function Pagination({
  page,
  totalPages,
  total,
  onPageChange,
  prevLabel,
  nextLabel,
  pageInfoLabel,
  totalLabel,
}: PaginationProps) {
  return (
    <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
      <span>{totalLabel}</span>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => { onPageChange(Math.max(1, page - 1)); }}
          disabled={page <= 1}
          className={btnBase}
        >
          <ChevronLeft className="size-3.5" aria-hidden />
          {prevLabel}
        </button>
        <span aria-live="polite">{pageInfoLabel}</span>
        <button
          type="button"
          onClick={() => { onPageChange(Math.min(totalPages, page + 1)); }}
          disabled={page >= totalPages}
          className={btnBase}
        >
          {nextLabel}
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
