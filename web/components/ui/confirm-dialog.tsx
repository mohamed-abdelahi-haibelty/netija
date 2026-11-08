'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string | React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  variant?: 'destructive' | 'primary';
  /** When set, requires typing this exact string before the confirm button enables */
  confirmText?: string;
  /** Label shown above the confirmation input when confirmText is set */
  confirmInputLabel?: string;
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = 'destructive',
  confirmText,
  confirmInputLabel,
}: ConfirmDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setLoading(false);
      setError(null);
      setInputValue('');
      if (confirmText) {
        inputRef.current?.focus();
      } else {
        confirmRef.current?.focus();
      }
    }
  }, [open, confirmText]);

  if (!open) return null;

  const hasConfirmTextGate = confirmText !== undefined;
  const matches = hasConfirmTextGate ? inputValue === confirmText : true;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) onCancel();
  };

  const handleConfirm = async () => {
    if (!matches || loading) return;
    setLoading(true);
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const confirmButton = cn(
    'inline-flex items-center gap-2 h-9 px-4 rounded-md text-sm font-medium',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    variant === 'destructive'
      ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
      : 'bg-primary text-primary-foreground hover:bg-primary/85 active:bg-primary/70',
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4"
      onClick={() => { if (!loading) onCancel(); }}
      onKeyDown={handleKeyDown}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-body"
        className="w-full max-w-md rounded-md border border-border bg-background p-5"
        onClick={(e) => { e.stopPropagation(); }}
      >
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        <div id="confirm-dialog-body" className="mt-2 text-sm text-muted-foreground">
          {body}
        </div>

        {hasConfirmTextGate && (
          <>
            <label
              htmlFor="confirm-dialog-input"
              className="mt-4 block text-xs font-medium text-muted-foreground"
            >
              {confirmInputLabel}
            </label>
            <input
              ref={inputRef}
              id="confirm-dialog-input"
              type="text"
              value={inputValue}
              onChange={(e) => { setInputValue(e.target.value); }}
              disabled={loading}
              autoComplete="off"
              className="mt-1.5 h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-status-fail-fg">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={cn(
              'inline-flex items-center gap-1.5 h-9 px-4 rounded-md',
              'border border-border text-foreground text-sm font-medium',
              'hover:bg-muted transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              'disabled:pointer-events-none disabled:opacity-50',
            )}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => { void handleConfirm(); }}
            disabled={!matches || loading}
            className={confirmButton}
          >
            {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
