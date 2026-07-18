'use client';

import { useRef } from 'react';
import { Mail, X } from 'lucide-react';
import XBrandIcon from '@/components/ui/XBrandIcon';
import type { Translator } from '@/lib/i18n';
import { useModalFocusTrap } from '@/lib/hooks/useModalFocusTrap';

type BillingContactModalProps = {
  t: Translator;
  message: string;
  onClose: () => void;
};

export default function BillingContactModal({ t, message, onClose }: BillingContactModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useModalFocusTrap<HTMLDivElement>({
    open: true,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="billing-contact-title"
        aria-describedby="billing-contact-message"
        tabIndex={-1}
        className="relative w-full max-w-md rounded-feature border border-border bg-raised p-7 shadow-level-3 animate-fade-in"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-control border border-border-subtle text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
          aria-label={t('quota_modal_close')}
        >
          <X size={16} />
        </button>

        <div className="mb-5">
          <h2 id="billing-contact-title" className="ui-eyebrow mb-3 pr-12">Billing</h2>
          <p id="billing-contact-message" className="text-sm text-ink leading-relaxed">
            {message || t('billing_payment_placeholder')}
          </p>
        </div>

        <div className="border-t border-border-subtle pt-5">
          <p className="text-xs text-ink-muted mb-4 leading-relaxed">
            {t('billing_contact_prompt')}
          </p>
          <div className="flex flex-col gap-3">
            <a
              href="https://x.com/Zzw_Prime"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex min-h-11 items-center gap-3 rounded-control border border-border px-4 py-3 transition-all duration-200 hover:border-gold/40 hover:bg-void/60"
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                <XBrandIcon className="text-ink-muted transition-colors group-hover:text-gold" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink group-hover:text-gold transition-colors">X (Twitter)</p>
                <p className="text-xs text-ink-subtle mt-0.5">@Zzw_Prime</p>
              </div>
            </a>
            <a
              href="mailto:xavierzhou23@gmail.com"
              className="group flex min-h-11 items-center gap-3 rounded-control border border-border px-4 py-3 transition-all duration-200 hover:border-gold/40 hover:bg-void/60"
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
                <Mail size={13} className="text-ink-muted group-hover:text-gold transition-colors" />
              </span>
              <div>
                <p className="text-xs font-medium text-ink group-hover:text-gold transition-colors">Email</p>
                <p className="text-xs text-ink-subtle mt-0.5">xavierzhou23@gmail.com</p>
              </div>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
