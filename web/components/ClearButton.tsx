'use client';

import { X } from 'lucide-react';

interface ClearButtonProps {
  label: string;
  visible: boolean;
  onClick: () => void;
}

export function ClearButton({ label, visible, onClick }: ClearButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-hidden={visible ? undefined : 'true'}
      tabIndex={visible ? 0 : -1}
      onPointerDown={(e) => { e.preventDefault(); }}
      onClick={onClick}
      className={`absolute right-1 top-1/2 -translate-y-1/2 p-3.5 rounded-sm text-muted-foreground hover:text-foreground active:opacity-60 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
