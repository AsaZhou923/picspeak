'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2, Coins, Ticket } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { redeemImageCreditCode } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';

const DEFAULT_CODE = 'PICSPEAKART';

export default function HomeImageCreditRedeem() {
  const { t } = useI18n();
  const { ensureToken, isLoading, userInfo } = useAuth();
  const [code, setCode] = useState(DEFAULT_CODE);
  const [message, setMessage] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const authReady = hydrated && !isLoading;
  const requiresSignIn = !authReady || !userInfo || userInfo.plan === 'guest';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requiresSignIn || redeeming || !code.trim()) {
      return;
    }

    setRedeeming(true);
    setMessage('');
    try {
      const token = await ensureToken();
      const result = await redeemImageCreditCode(token, code);
      setCode(result.code);
      setMessage(t('home_credit_redeem_success').replace('{credits}', String(result.credits_granted)));
    } catch (error) {
      setMessage(formatUserFacingError(t, error, t('home_credit_redeem_error')));
    } finally {
      setRedeeming(false);
    }
  }

  return (
    <div className="relative mt-3 w-full max-w-2xl rounded-lg border border-border-subtle bg-surface/45 px-4 py-3 text-left backdrop-blur-sm animate-fade-in anim-fill-both delay-300">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-gold/25 bg-gold/10 text-gold">
            <Ticket size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">{t('home_credit_redeem_title')}</p>
            <p className="mt-0.5 text-xs leading-5 text-ink-muted">{t('home_credit_redeem_hint')}</p>
          </div>
        </div>

        {!authReady ? (
          <button
            type="button"
            disabled
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded border border-gold/30 bg-gold/10 px-4 text-sm font-medium text-gold opacity-70"
          >
            <Coins size={15} />
            {t('home_credit_redeem_login')}
          </button>
        ) : requiresSignIn ? (
          <ClerkSignInTrigger
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded border border-gold/30 bg-gold/10 px-4 text-sm font-medium text-gold transition-colors hover:bg-gold/15"
            signedInClassName="hidden"
          >
            <Coins size={15} />
            {t('home_credit_redeem_login')}
          </ClerkSignInTrigger>
        ) : (
          <form onSubmit={handleSubmit} className="flex w-full gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="home-credit-code">
              {t('home_credit_redeem_label')}
            </label>
            <input
              id="home-credit-code"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder={t('home_credit_redeem_placeholder')}
              className="h-10 min-w-0 flex-1 rounded border border-border-subtle bg-void/35 px-3 font-mono text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-gold/45 sm:w-40"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={redeeming || !code.trim()}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded bg-gold px-4 text-sm font-medium text-void transition-all hover:bg-gold-light active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"
            >
              {redeeming ? t('home_credit_redeem_busy') : t('home_credit_redeem_cta')}
            </button>
          </form>
        )}
      </div>

      {message && (
        <p className="mt-3 flex items-start gap-2 rounded border border-gold/15 bg-gold/10 px-3 py-2 text-xs leading-5 text-ink-muted">
          <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-gold" />
          <span>{message}</span>
        </p>
      )}
    </div>
  );
}
