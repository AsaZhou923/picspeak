'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CN_PRO_CHECKOUT_TIP, startProCheckout } from '@/lib/pro-checkout';

export default function HomeCheckoutButton() {
  const { t, locale } = useI18n();
  const { ensureToken, isLoading, userInfo } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);
  const requiresSignIn = !userInfo || userInfo.plan === 'guest';

  async function handleCheckout() {
    if (checkoutLoading) return;

    setCheckoutLoading(true);
    try {
      await startProCheckout(ensureToken, locale);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <>
      {isLoading ? (
        <button
          type="button"
          disabled
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-void opacity-70 transition-all duration-200 disabled:cursor-wait"
        >
          {t('generation_auth_loading_cta')}
        </button>
      ) : requiresSignIn ? (
        <ClerkSignInTrigger
          fallbackRedirectUrl="/account/usage"
          signedInClassName="hidden"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)]"
        >
          {t('usage_login_now')}
          <ArrowRight size={14} />
        </ClerkSignInTrigger>
      ) : (
        <button
          type="button"
          onClick={() => void handleCheckout()}
          disabled={checkoutLoading}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)] disabled:cursor-wait disabled:opacity-70"
        >
          {checkoutLoading ? t('usage_checkout_loading') : t('usage_checkout_pro')}
          <ArrowRight size={14} />
        </button>
      )}
      {locale === 'zh' && (
        <button
          type="button"
          onClick={() => setActivationOpen(true)}
          className="mt-3 inline-flex w-full items-center justify-center rounded-md border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-ink transition-colors hover:border-gold/30 hover:text-gold"
        >
          输入激活码
        </button>
      )}
      {locale === 'zh' && (
        <p className="mt-3 text-xs leading-6 text-ink-subtle">
          {CN_PRO_CHECKOUT_TIP}
        </p>
      )}

      <ActivationCodeModal open={activationOpen} onClose={() => setActivationOpen(false)} />
    </>
  );
}
