'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { useAuth } from '@/lib/auth-context';
import { redeemActivationCode } from '@/lib/api';
import { formatUserFacingError } from '@/lib/error-utils';
import { useModalFocusTrap } from '@/lib/hooks/useModalFocusTrap';
import { useI18n } from '@/lib/i18n';
import { localeToIntlLocale } from '@/lib/locale';
import { ActivationCodeRedeemResponse } from '@/lib/types';

type ActivationCodeModalProps = {
  open: boolean;
  onClose: () => void;
  onRedeemed?: (result: ActivationCodeRedeemResponse) => void | Promise<void>;
};

function formatActivationDate(value: string, locale: 'zh' | 'en' | 'ja'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(localeToIntlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ActivationCodeModal({
  open,
  onClose,
  onRedeemed,
}: ActivationCodeModalProps) {
  const { t, locale } = useI18n();
  const { ensureToken, userInfo, syncPlan } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const codeInputId = useId();
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useModalFocusTrap<HTMLDivElement>({
    open,
    onClose,
    initialFocusRef: closeButtonRef,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setCode('');
      setMessage('');
      setRedeeming(false);
    }
  }, [open]);

  async function handleRedeem() {
    if (redeeming || !code.trim()) {
      return;
    }

    setRedeeming(true);
    setMessage('');
    try {
      const token = await ensureToken();
      const result = await redeemActivationCode(token, code);
      syncPlan(result.plan);
      await onRedeemed?.(result);
      setCode('');
      setMessage(t('activation_code_success').replace('{date}', formatActivationDate(result.activated_until, locale)));
    } catch (error) {
      setMessage(formatUserFacingError(t, error, t('activation_code_error')));
    } finally {
      setRedeeming(false);
    }
  }

  if (!mounted || !open) {
    return null;
  }

  const requiresSignIn = !userInfo || userInfo.plan === 'guest';

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        ref={dialogRef}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-[560px] overflow-y-auto rounded-feature border border-border-subtle bg-surface p-6 text-ink shadow-level-3 sm:p-9"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('activation_code_dialog_label')}
        tabIndex={-1}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink sm:right-4 sm:top-4"
          aria-label={t('quota_modal_close')}
        >
          <X size={20} />
        </button>

        <div className="space-y-4 pr-8">
          <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{t('activation_code_title')}</h2>
          <p className="max-w-[420px] text-base leading-7 text-ink-muted">
            {t('activation_code_body')}
          </p>
        </div>

        {requiresSignIn ? (
          <div className="mt-8 space-y-5">
            <p className="rounded-control border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-7 text-ink">
              {t('activation_code_signin_hint')}
            </p>
            <ClerkSignInTrigger
              className="ui-action-primary w-full px-6 py-3 text-base"
              signedInClassName="hidden"
            >
              {t('activation_code_signin_cta')}
            </ClerkSignInTrigger>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <label htmlFor={codeInputId} className="block text-sm text-ink">{t('activation_code_input_label')}</label>
              <input
                id={codeInputId}
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t('activation_code_placeholder')}
                className="w-full rounded-control border border-border bg-void px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-gold focus:ring-2 focus:ring-gold/20 sm:text-lg"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {message && (
              <p className="rounded-control border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-7 text-ink" role="status">
                {message}
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRedeem()}
                disabled={redeeming || !code.trim()}
                className="ui-action-primary flex-1 px-6 py-3 text-base disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {redeeming ? t('activation_code_redeeming') : t('activation_code_submit')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="ui-action-secondary flex-1 px-6 py-3 text-base"
              >
                {t('quota_modal_close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
