import { AlertCircle, ArrowRight, X } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { type Translator } from '@/lib/i18n';

interface QuotaModalProps {
  plan: string;
  onClose: () => void;
  t: Translator;
}

export function QuotaModal({ plan, onClose, t }: QuotaModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: 'rgb(var(--color-void) / 0.82)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-quota-title"
        aria-describedby="workspace-quota-description"
        className="ui-feature-panel relative w-full max-w-sm space-y-5 p-8 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          aria-label={t('quota_modal_close')}
          title={t('quota_modal_close')}
        >
          <X size={16} />
        </button>
        <div className="w-12 h-12 rounded-full bg-rust/10 border border-rust/30 flex items-center justify-center">
          <AlertCircle size={22} className="text-rust" />
        </div>
        <div>
          <h2 id="workspace-quota-title" className="mb-2 font-display text-2xl">{t('quota_modal_title')}</h2>
          <p id="workspace-quota-description" className="text-sm leading-relaxed text-ink-muted">{t('quota_modal_body')}</p>
        </div>
        <div className="flex flex-col gap-2 pt-1">
          {plan === 'guest' ? (
            <ClerkSignInTrigger
              className="ui-action-primary min-h-11 px-5 py-2.5 text-sm"
              signedInClassName="inline-flex items-center justify-center"
            >
              {t('quota_modal_upgrade')}
              <ArrowRight size={13} />
            </ClerkSignInTrigger>
          ) : (
            <p className="text-xs text-ink-muted text-center">{t('quota_modal_upgrade')}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-control py-2 text-sm text-ink-muted transition-colors hover:bg-surface hover:text-ink"
          >
            {t('quota_modal_close')}
          </button>
        </div>
      </div>
    </div>
  );
}
