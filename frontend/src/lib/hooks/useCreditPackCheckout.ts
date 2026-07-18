'use client';

import { useCallback, useState } from 'react';
import { createImageCreditPackCheckout } from '@/lib/api';
import { rememberCheckoutReturnPath } from '@/lib/checkout-return';
import {
  closeExternalCheckoutWindow,
  navigateExternalCheckoutWindow,
  openExternalCheckoutWindow,
} from '@/lib/external-checkout-window';
import { formatUserFacingError } from '@/lib/error-utils';
import type { Locale, Translator } from '@/lib/i18n';
import { trackProductEvent } from '@/lib/product-analytics';

type CreditPackCurrency = 'usd';
type CreditPackMetadata = Record<string, unknown>;

type StartCreditPackCheckoutOptions = {
  currency?: CreditPackCurrency;
  entrypoint: string;
  pagePath?: string;
  metadata?: CreditPackMetadata;
};

type UseCreditPackCheckoutOptions = {
  ensureToken: () => Promise<string>;
  locale: Locale;
  t: Translator;
  disabled?: boolean;
  onMessage?: (message: string) => void;
};

function currentPagePath(): string {
  return typeof window === 'undefined' ? '/account/usage' : window.location.pathname;
}

export function useCreditPackCheckout({
  ensureToken,
  locale,
  t,
  disabled = false,
  onMessage,
}: UseCreditPackCheckoutOptions) {
  const [loadingCurrency, setLoadingCurrency] = useState<CreditPackCurrency | null>(null);
  const [message, setMessage] = useState('');

  const publishMessage = useCallback(
    (nextMessage: string) => {
      setMessage(nextMessage);
      onMessage?.(nextMessage);
    },
    [onMessage],
  );

  const startCreditPackCheckout = useCallback(
    async ({
      currency = 'usd',
      entrypoint,
      pagePath,
      metadata,
    }: StartCreditPackCheckoutOptions) => {
      if (disabled || loadingCurrency) return false;

      rememberCheckoutReturnPath();
      const checkoutWindow = openExternalCheckoutWindow(t('usage_checkout_loading'));
      setLoadingCurrency(currency);
      publishMessage('');

      try {
        const token = await ensureToken();
        const response = await createImageCreditPackCheckout(token, { currency, locale });

        if (!response.checkout_url) {
          closeExternalCheckoutWindow(checkoutWindow);
          publishMessage(`${response.credits} credits / ${response.price} checkout is unavailable.`);
          return false;
        }

        void trackProductEvent('credit_pack_checkout_started', {
          token,
          pagePath: pagePath ?? currentPagePath(),
          locale,
          metadata: {
            ...metadata,
            entrypoint,
            pack: response.pack,
            pack_credits: response.credits,
            price: response.price,
          },
        });

        if (!navigateExternalCheckoutWindow(checkoutWindow, response.checkout_url)) {
          throw new Error('Checkout window was blocked');
        }

        return true;
      } catch (err) {
        closeExternalCheckoutWindow(checkoutWindow);
        publishMessage(formatUserFacingError(t, err, t('usage_checkout_unavailable')));
        return false;
      } finally {
        setLoadingCurrency(null);
      }
    },
    [disabled, ensureToken, loadingCurrency, locale, publishMessage, t],
  );

  return {
    busy: loadingCurrency !== null,
    loadingCurrency,
    message,
    setMessage: publishMessage,
    startCreditPackCheckout,
  };
}
