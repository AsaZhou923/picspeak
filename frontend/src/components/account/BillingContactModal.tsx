'use client';

import { Mail, X } from 'lucide-react';
import XBrandIcon from '@/components/ui/XBrandIcon';
import type { Translator } from '@/lib/i18n';

type BillingContactModalProps = {
  t: Translator;
  message: string;
  onClose: () => void;
};

export default function BillingContactModal({ t, message, onClose }: BillingContactModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-raised border border-border rounded-xl p-7 shadow-2xl animate-fade-in"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="mb-5">
          <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">Billing</p>
          <p className="text-sm text-ink leading-relaxed">
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
              className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:border-gold/40 hover:bg-void/60 transition-all duration-200 group"
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
              className="flex items-center gap-3 px-4 py-3 border border-border rounded-lg hover:border-gold/40 hover:bg-void/60 transition-all duration-200 group"
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
