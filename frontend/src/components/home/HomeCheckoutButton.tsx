'use client';

import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import ActivationCodeModal from '@/components/billing/ActivationCodeModal';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { CN_PRO_CHECKOUT_TIP, openChinaProPurchase, startProCheckout } from '@/lib/pro-checkout';

export default function HomeCheckoutButton() {
  const { t, locale } = useI18n();
  const { ensureToken } = useAuth();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [chinaCheckoutLoading, setChinaCheckoutLoading] = useState(false);
  const [activationOpen, setActivationOpen] = useState(false);

  async function handleCheckout() {
    if (checkoutLoading) {
      return;
    }

    setCheckoutLoading(true);
    try {
      await startProCheckout(ensureToken, locale);
    } catch {
      window.alert(t('usage_checkout_unavailable'));
    } finally {
      setCheckoutLoading(false);
    }
  }

  function handleChinaCheckout() {
    if (chinaCheckoutLoading) {
      return;
    }

    setChinaCheckoutLoading(true);
    try {
      openChinaProPurchase();
    } finally {
      setChinaCheckoutLoading(false);
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
        {checkoutLoading ? t('usage_checkout_loading') : locale === 'zh' ? '使用 Lemon Squeezy 开通' : t('usage_checkout_pro')}
        <ArrowRight size={14} />
      </button>
      {locale === 'zh' && (
        <button
          type="button"
          onClick={handleChinaCheckout}
          disabled={chinaCheckoutLoading}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-4 py-3 text-sm font-medium text-gold transition-colors hover:bg-gold/15 disabled:opacity-70"
        >
          {chinaCheckoutLoading ? '正在打开爱发电…' : '中文用户可选：前往爱发电开通'}
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
