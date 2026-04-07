import { createBillingCheckout } from './api';
import { Locale } from './i18n';

export const CN_PRO_CHECKOUT_TIP =
  '国内用户可前往爱发电下单；下单后请输入我发送的激活码，即可开通 30 天 Pro 会员。';

export const CN_PRO_PAYMENT_URL = 'https://www.ifdian.net/item/3c9d0270327011f19cb452540025c377';

export function openChinaProPurchase(): void {
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
  locale?: Locale
): Promise<void> {
  if (locale === 'zh') {
    openChinaProPurchase();
    return;
  }

  const token = await ensureToken();
  const response = await createBillingCheckout(token, 'pro');

  if (!response.checkout_url) {
    throw new Error('Checkout URL is missing');
  }

  window.location.assign(response.checkout_url);
}
