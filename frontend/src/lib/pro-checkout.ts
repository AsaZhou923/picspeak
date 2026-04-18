import { createBillingCheckout } from './api';
import { Locale } from './i18n';
import { trackProductEvent } from './product-analytics';

export const CN_PRO_CHECKOUT_TIP =
  '主支付入口仍为 Lemon Squeezy。中文用户也可以选择爱发电，通常会有更优惠的价格；下单后请输入我发送的激活码，即可开通 30 天 Pro。';

export const CN_PRO_PAYMENT_URL = 'https://www.ifdian.net/item/3c9d0270327011f19cb452540025c377';

export function openChinaProPurchase(locale?: Locale): void {
  void trackProductEvent('upgrade_pro_clicked', {
    locale,
    pagePath: typeof window === 'undefined' ? '/account/usage' : window.location.pathname,
    metadata: {
      channel: 'ifdian',
    },
  });
  const link = document.createElement('a');
  link.href = CN_PRO_PAYMENT_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function startProCheckout(
  ensureToken: () => Promise<string>,
  _locale?: Locale
): Promise<void> {
  void trackProductEvent('upgrade_pro_clicked', {
    locale: _locale,
    pagePath: typeof window === 'undefined' ? '/account/usage' : window.location.pathname,
    metadata: {
      channel: 'lemonsqueezy',
    },
  });
  const token = await ensureToken();
  const response = await createBillingCheckout(token, 'pro');

  if (!response.checkout_url) {
    throw new Error('Checkout URL is missing');
  }

  window.location.assign(response.checkout_url);
}
