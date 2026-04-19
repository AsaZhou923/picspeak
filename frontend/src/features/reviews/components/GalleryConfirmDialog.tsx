import { LayoutGrid, X } from 'lucide-react';

interface GalleryConfirmDialogProps {
  onClose: () => void;
  onConfirm: () => void;
  actionBusy: string | null;
  galleryActionCopy: {
    dialogLabel: string;
    dialogTitle: string;
    dialogBody: string;
    dialogFootnote: string;
    dialogCancel: string;
    dialogConfirm: string;
  };
}

export function GalleryConfirmDialog({ onClose, onConfirm, actionBusy, galleryActionCopy }: GalleryConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/95" />
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-border bg-surface p-6 shadow-[0_32px_96px_rgba(0,0,0,0.72)] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-confirm-title"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-border-subtle p-2 text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
          aria-label={galleryActionCopy.dialogCancel}
        >
          <X size={14} />
        </button>
        <div className="mb-5">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/80">
            <LayoutGrid size={12} />
            {galleryActionCopy.dialogLabel}
          </p>
          <h2 id="gallery-confirm-title" className="font-display text-3xl text-ink">
            {galleryActionCopy.dialogTitle}
          </h2>
          <p className="mt-3 text-sm leading-7 text-ink-muted">{galleryActionCopy.dialogBody}</p>
          <div className="mt-4 rounded-2xl border border-border-subtle bg-raised px-4 py-3 text-xs leading-6 text-ink-muted">
            {galleryActionCopy.dialogFootnote}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
          >
            {galleryActionCopy.dialogCancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={actionBusy !== null}
            className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:opacity-60"
          >
            {galleryActionCopy.dialogConfirm}
          </button>
        </div>
      </div>
    </div>
  );
}
