import { createBillingCheckout } from './api';
import {
  closeExternalCheckoutWindow,
  navigateExternalCheckoutWindow,
  openExternalCheckoutWindow,
} from './external-checkout-window';
import { rememberCheckoutReturnPath } from './checkout-return';
import { Locale } from './i18n';
import { trackProductEvent } from './product-analytics';

export const CN_PRO_CHECKOUT_TIP =
  '中文用户使用 Lemon Squeezy 中文专属 checkout，$1.99 一次性开通 30 天 Pro，不会自动续费。已收到激活码的用户仍可在站内兑换。';

const ACCOUNT_USAGE_PATH = '/account/usage';

export async function startProCheckout(
  ensureToken: () => Promise<string>,
  locale?: Locale
): Promise<void> {
  rememberCheckoutReturnPath();
  const checkoutWindow = openExternalCheckoutWindow(
    locale === 'zh' ? '正在打开 Pro 支付页面...' : 'Opening Pro checkout...'
  );

  void trackProductEvent('upgrade_pro_clicked', {
    locale,
    pagePath: typeof window === 'undefined' ? '/account/usage' : window.location.pathname,
    metadata: {
      channel: locale === 'zh' ? 'lemonsqueezy_zh' : 'lemonsqueezy',
    },
  });

  try {
    const token = await ensureToken();
    const response = await createBillingCheckout(token, 'pro', locale);

    if (response.status === 'already_active') {
      closeExternalCheckoutWindow(checkoutWindow);
      if (typeof window !== 'undefined') {
        window.location.assign(ACCOUNT_USAGE_PATH);
      }
      return;
    }

    if (!response.checkout_url) {
      throw new Error('Checkout URL is missing');
    }

    if (!navigateExternalCheckoutWindow(checkoutWindow, response.checkout_url)) {
      throw new Error('Checkout window was blocked');
    }
  } catch (error) {
    closeExternalCheckoutWindow(checkoutWindow);
    throw error;
  }
}
