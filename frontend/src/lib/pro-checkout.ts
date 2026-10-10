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
  '中文 Pro 为 $3.99/月，按月自动续费，可随时取消；现有 Pro 用户不受影响。已收到激活码的用户仍可在站内兑换。';

const ACCOUNT_USAGE_PATH = '/account/usage';
const CHECKOUT_LOADING_COPY: Record<Locale, string> = {
  zh: '正在打开 Pro 支付页面…',
  en: 'Opening Pro checkout…',
  ja: 'Pro の決済画面を開いています…',
};

export async function startProCheckout(
  ensureToken: () => Promise<string>,
  locale?: Locale
): Promise<void> {
  rememberCheckoutReturnPath();
  const checkoutWindow = openExternalCheckoutWindow(CHECKOUT_LOADING_COPY[locale ?? 'en']);

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
