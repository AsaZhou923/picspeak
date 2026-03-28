'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { CN_PRO_CHECKOUT_TIP, startProCheckout } from '@/lib/pro-checkout';
import { useI18n } from '@/lib/i18n';

export default function HomeCheckoutButton() {
  const { t, locale } = useI18n();
  const { ensureToken } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  async function handleCheckout() {
    if (checkoutLoading) {
      return;
    }

    setCheckoutLoading(true);
    try {
      await startProCheckout(ensureToken);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCheckout()}
        disabled={checkoutLoading}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gold px-4 py-3 text-sm font-medium text-void transition-all duration-200 hover:bg-gold-light hover:shadow-[0_0_24px_rgba(200,162,104,0.35)] disabled:cursor-wait disabled:opacity-70"
      >
        {checkoutLoading ? t('usage_checkout_loading') : t('usage_checkout_pro')}
        <ArrowRight size={14} />
      </button>
      {locale === 'zh' && (
        <p className="mt-3 text-xs leading-6 text-ink-subtle">
          {CN_PRO_CHECKOUT_TIP}
        </p>
      )}
    </>
  );
}
