'use client';

import { AlertTriangle, Loader2, X } from 'lucide-react';
import { useId, useRef } from 'react';
import { useModalFocusTrap } from '@/lib/hooks/useModalFocusTrap';

interface DeleteConfirmDialogProps {
  label: string;
  title: string;
  body: string;
  consequences: string[];
  cancelLabel: string;
  confirmLabel: string;
  busyLabel: string;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function DeleteConfirmDialog({
  label,
  title,
  body,
  consequences,
  cancelLabel,
  confirmLabel,
  busyLabel,
  busy,
  error,
  onClose,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const safeClose = () => {
    if (!busy) onClose();
  };
  const dialogRef = useModalFocusTrap<HTMLDivElement>({
    open: true,
    onClose: safeClose,
    initialFocusRef: cancelButtonRef,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={safeClose}
    >
      <div className="absolute inset-0 bg-void/95" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-border bg-surface p-6 shadow-level-3 animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
      >
        <button
          type="button"
          onClick={safeClose}
          disabled={busy}
          className="absolute right-4 top-4 flex min-h-11 min-w-11 items-center justify-center rounded-full border border-border-subtle text-ink-muted transition-colors hover:border-rust/40 hover:text-rust disabled:opacity-50"
          aria-label={cancelLabel}
        >
          <X size={14} aria-hidden="true" />
        </button>

        <div className="mb-5 pr-10">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-rust/25 bg-rust/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-rust">
            <AlertTriangle size={12} aria-hidden="true" />
            {label}
          </p>
          <h2 id={titleId} className="font-display text-3xl text-ink">
            {title}
          </h2>
          <p id={descId} className="mt-3 text-sm leading-7 text-ink-muted">
            {body}
          </p>
          {consequences.length > 0 && (
            <ul className="mt-4 space-y-2 rounded-card border border-rust/25 bg-rust/5 px-4 py-3 text-xs leading-6 text-ink-muted">
              {consequences.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rust" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p
              role="alert"
              className="mt-4 rounded-control border border-rust/30 bg-rust/10 px-3.5 py-2.5 text-sm text-rust"
            >
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={safeClose}
            disabled={busy}
            className="ui-action-secondary px-4 py-2.5 text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
            className="ui-action-destructive px-5 py-2.5 text-sm disabled:opacity-60"
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
