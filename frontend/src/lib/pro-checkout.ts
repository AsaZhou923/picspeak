import { createBillingCheckout } from './api';

export const CN_PRO_CHECKOUT_TIP =
  'Tips：当前暂未接入国内支付渠道，国内用户可添加微信 Asa-180 购买，另有优惠价。';

export async function startProCheckout(ensureToken: () => Promise<string>): Promise<void> {
  const token = await ensureToken();
  const response = await createBillingCheckout(token, 'pro');

  if (!response.checkout_url) {
    throw new Error('Checkout URL is missing');
  }

  window.location.assign(response.checkout_url);
}
