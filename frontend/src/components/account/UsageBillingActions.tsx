'use client';

import { ArrowRight } from 'lucide-react';
import type { Translator } from '@/lib/i18n';
import type { UsageResponse } from '@/lib/types';

type UsageBillingActionsProps = {
  t: Translator;
  usage: Pick<UsageResponse, 'plan' | 'billing_portal_available' | 'subscription'>;
  locale: string;
  checkoutLoading: boolean;
  portalLoading: boolean;
  onCheckout: () => void;
  onManageSubscription: () => void;
};

export default function UsageBillingActions({
  t,
  usage,
  locale,
  checkoutLoading,
  portalLoading,
  onCheckout,
  onManageSubscription,
}: UsageBillingActionsProps) {
  if (usage.plan === 'guest') return null;

  // Prefer recovery over a new checkout for existing billing customers, even
  // when their Pro entitlement has expired or payment is overdue.
  const canManage = usage.billing_portal_available;
  const canCheckout = usage.plan === 'free'
    || (locale === 'zh' && usage.subscription?.provider === 'activation_code');
  if (!canManage && !canCheckout) return null;

  const loading = canManage ? portalLoading : checkoutLoading;
  return (
    <button
      type="button"
      onClick={canManage ? onManageSubscription : onCheckout}
      disabled={loading}
      className="ui-action-secondary px-3 py-1.5 text-xs text-gold disabled:opacity-60"
    >
      {canManage
        ? t(loading ? 'usage_manage_loading' : 'usage_manage_subscription')
        : t(loading ? 'usage_checkout_loading' : 'usage_checkout_pro')}
      <ArrowRight size={11} />
    </button>
  );
}
