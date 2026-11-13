import { localeToIntlLocale } from '@/lib/locale';
import type { UsageResponse, UsageSubscription } from '@/lib/types';

export const fixedSubscriptionCopy = {
  zh: {
    label: 'Pro 到期时间',
    pending: '等待同步',
    renewsLabel: '下次续费时间',
    cancelledHint: '此订阅已关闭自动续费，权益保留至本期结束。',
    fixedHint: '此权益有固定有效期，不会自动续费。',
    renewingHint: '此订阅按月自动续费，可在账单管理中取消。',
  },
  en: {
    label: 'Pro expires on',
    pending: 'Syncing',
    renewsLabel: 'Next renewal',
    cancelledHint: 'Auto-renew is off for this subscription. Access remains until the end of its paid term.',
    fixedHint: 'This access has a fixed term and does not renew automatically.',
    renewingHint: 'This subscription renews monthly. You can cancel in billing management.',
  },
  ja: {
    label: 'Pro の終了日時',
    pending: '同期中',
    renewsLabel: '次回更新日時',
    cancelledHint: 'このサブスクリプションの自動更新は停止中です。支払い済み期間の終了まで利用できます。',
    fixedHint: 'この利用権には有効期限があり、自動更新されません。',
    renewingHint: 'このサブスクリプションは毎月自動更新されます。請求管理から解約できます。',
  },
} as const;

const billingStatusCopy = {
  zh: {
    failed: '最近一次订阅付款未成功，请在账单管理中检查付款方式。',
    refunded: '最近一次订阅付款的退款已记录。退款状态与订阅有效期分别确认。',
    partial_refund: '最近一次订阅付款的部分退款已记录；如有疑问，请联系账单支持。',
    ended: '这笔订阅或购买权益已结束。',
    pending: '付款或订阅仍在同步，当前套餐以本页显示为准。',
    pro: '当前账号仍有有效 Pro 权益，以本页的有效期为准。',
    free: '当前账号使用 Free 套餐。',
  },
  en: {
    failed: 'The latest subscription payment failed. Check your payment method in billing management.',
    refunded: 'A refund for the latest subscription payment has been recorded. Subscription access is confirmed separately.',
    partial_refund: 'A partial refund for the latest subscription payment has been recorded. Contact billing support with any questions.',
    ended: 'This subscription or purchased access has ended.',
    pending: 'Payment or subscription details are still syncing. Your current plan is shown on this page.',
    pro: 'Your account still has valid Pro access. Its current term is shown on this page.',
    free: 'Your account is currently on Free.',
  },
  ja: {
    failed: '直近のサブスクリプション決済に失敗しました。請求管理でお支払い方法をご確認ください。',
    refunded: '直近のサブスクリプション決済の返金が記録されました。利用権の有効期間は別途確認されます。',
    partial_refund: '直近のサブスクリプション決済の一部返金が記録されました。ご不明な点は請求サポートにお問い合わせください。',
    ended: 'このサブスクリプションまたは購入した利用権は終了しました。',
    pending: '決済または契約情報を同期中です。現在のプランはこのページの表示をご確認ください。',
    pro: 'アカウントには引き続き有効な Pro 利用権があります。有効期間はこのページに表示されます。',
    free: '現在のアカウントは Free プランです。',
  },
} as const;

export function getSubscriptionTermCopy(subscription: UsageSubscription | null | undefined, locale: 'zh' | 'en' | 'ja') {
  const copy = fixedSubscriptionCopy[locale];
  const isFixedTerm = subscription?.provider === 'activation_code'
    || Boolean(subscription?.ends_at && !subscription?.renews_at && subscription?.status !== 'cancelled');
  return {
    label: !isFixedTerm && !subscription?.cancelled && subscription?.renews_at ? copy.renewsLabel : copy.label,
    hint: !subscription ? null : isFixedTerm ? copy.fixedHint : subscription.cancelled ? copy.cancelledHint : subscription.renews_at ? copy.renewingHint : null,
  };
}

export function getBillingStatusNotice(
  usage: Pick<UsageResponse, 'plan' | 'billing_subscription'>,
  locale: 'zh' | 'en' | 'ja',
): string | null {
  if (usage.plan === 'guest' || !usage.billing_subscription) return null;
  const subscription = usage.billing_subscription;
  const copy = billingStatusCopy[locale];
  const payment = subscription.last_payment_status;
  let message: string | null = null;
  if (payment === 'refunded' || payment === 'partial_refund') {
    message = copy[payment];
  } else if (payment === 'failed' || ['past_due', 'unpaid'].includes(subscription.status)) {
    message = copy.failed;
  } else if (['expired', 'refunded'].includes(subscription.status) || (subscription.status === 'cancelled' && usage.plan === 'free')) {
    message = copy.ended;
  } else if (subscription.status === 'pending') {
    return copy.pending;
  }
  return message ? `${message} ${copy[usage.plan]}` : null;
}

export const activationUiCopy = {
  zh: {
    title: 'Pro 开通与激活码',
    body: 'Pro 为 $3.99 一次性开通 30 天，不会自动续费，支持微信 / 支付宝；到期后可再次购买。支付成功后会自动生效，已收到激活码的用户仍可在站内兑换。',
    stepBuy: '完成 Pro 支付',
    stepReceive: '支付成功后自动同步',
    stepRedeem: '已有激活码也可登录后兑换',
    purchaseCta: '开通 Pro',
    renewCta: '再开通 30 天 Pro',
    redeemCta: '输入激活码',
    signInFirst: '先登录再兑换',
    subscriptionHint: '当前账号通过激活码开通，无自动续费；现有会员时长保持不变。',
    modalEyebrow: 'Activation',
    modalTitle: '兑换激活码',
    modalBody: '如果你已经收到激活码，可以在这里兑换。兑换成功后，当前账号会按激活码规则获得或延长 Pro 会员。',
    codeLabel: '激活码',
    codePlaceholder: '例如 PSCN-ABCD-EFGH-JKLM',
    redeemSubmit: '立即兑换',
    redeeming: '正在兑换...',
    close: '关闭',
    success: '兑换成功，Pro 已开通至 {date}。',
    error: '暂时无法兑换激活码，请稍后再试。',
    pending: '已开通',
  },
  en: {
    pending: 'Activated',
  },
  ja: {
    pending: '有効化済み',
  },
} as const;

export function formatSubscriptionDate(value: string | null | undefined, locale: 'zh' | 'en' | 'ja'): string | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat(localeToIntlLocale(locale), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}
