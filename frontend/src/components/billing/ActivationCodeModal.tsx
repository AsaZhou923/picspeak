'use client';

import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        ref={dialogRef}
        className="relative w-full max-w-[560px] rounded-[26px] border border-white/10 bg-[#171717]/95 p-9 shadow-[0_40px_120px_rgba(0,0,0,0.55)]"
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
          className="absolute right-5 top-5 text-white/65 transition-colors hover:text-white"
          aria-label={t('quota_modal_close')}
        >
          <X size={20} />
        </button>

        <div className="space-y-4 pr-8">
          <p className="text-xs font-mono uppercase tracking-[0.24em] text-accent-muted">{t('activation_code_label')}</p>
          <h2 className="font-display text-4xl leading-none text-white">{t('activation_code_title')}</h2>
          <p className="max-w-[420px] text-lg leading-8 text-white/72">
            {t('activation_code_body')}
          </p>
        </div>

        {requiresSignIn ? (
          <div className="mt-8 space-y-5">
            <p className="rounded-2xl border border-gold/15 bg-gold/10 px-5 py-4 text-sm leading-7 text-white/82">
              {t('activation_code_signin_hint')}
            </p>
            <ClerkSignInTrigger
              className="inline-flex w-full items-center justify-center rounded-full bg-gold px-6 py-4 text-lg font-medium text-void transition-colors hover:bg-gold-light"
              signedInClassName="hidden"
            >
              {t('activation_code_signin_cta')}
            </ClerkSignInTrigger>
          </div>
        ) : (
          <div className="mt-8 space-y-5">
            <div className="space-y-2">
              <label className="block text-sm text-white/82">{t('activation_code_input_label')}</label>
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder={t('activation_code_placeholder')}
                className="w-full rounded-2xl border border-white/10 bg-surface px-5 py-4 text-xl text-white outline-none transition-colors placeholder:text-white/35 focus:border-gold/40"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>

            {message && (
              <p className="rounded-2xl border border-gold/15 bg-gold/10 px-5 py-4 text-sm leading-7 text-white/82">
                {message}
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRedeem()}
                disabled={redeeming || !code.trim()}
                className="inline-flex flex-1 items-center justify-center rounded-full bg-gold px-6 py-4 text-lg font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-wait disabled:opacity-70"
              >
                {redeeming ? t('activation_code_redeeming') : t('activation_code_submit')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] px-6 py-4 text-lg font-medium text-white transition-colors hover:border-gold/30 hover:text-gold"
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
