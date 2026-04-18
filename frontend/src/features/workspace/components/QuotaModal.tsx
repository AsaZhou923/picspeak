import { AlertCircle, ArrowRight, X } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';

interface QuotaModalProps {
  plan: string;
  onClose: () => void;
  t: (key: string) => string;
}

export function QuotaModal({ plan, onClose, t }: QuotaModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgba(8,8,8,0.80)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm bg-raised border border-border rounded-lg p-8 space-y-5 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-muted hover:text-ink transition-colors"
          aria-label={t('quota_modal_close')}
          title={t('quota_modal_close')}
        >
          <X size={16} />
        </button>
        <div className="w-12 h-12 rounded-full bg-rust/10 border border-rust/30 flex items-center justify-center">
          <AlertCircle size={22} className="text-rust" />
        </div>
        <div>
          <h2 className="font-display text-2xl mb-2">{t('quota_modal_title')}</h2>
          <p className="text-sm text-ink-muted leading-relaxed">{t('quota_modal_body')}</p>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {plan === 'guest' ? (
            <ClerkSignInTrigger
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
              signedInClassName="inline-flex items-center justify-center"
            >
              {t('quota_modal_upgrade')}
              <ArrowRight size={13} />
            </ClerkSignInTrigger>
          ) : (
            <p className="text-xs text-ink-muted text-center">{t('quota_modal_upgrade')}</p>
          )}
          <button
            onClick={onClose}
            className="text-sm text-ink-muted hover:text-ink transition-colors py-1"
          >
            {t('quota_modal_close')}
          </button>
        </div>
      </div>
    </div>
  );
}
