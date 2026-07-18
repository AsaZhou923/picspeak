import { localeToIntlLocale } from '@/lib/locale';

export const fixedSubscriptionCopy = {
  zh: {
    label: 'Pro 到期时间',
    pending: '等待同步',
    cancelledHint: '已关闭自动续费，到期后将降级。',
  },
  en: {
    label: 'Pro expires on',
    pending: 'Syncing',
    cancelledHint: 'Auto-renew is off and the plan will downgrade at the end of the term.',
  },
  ja: {
    label: 'Pro の終了日時',
    pending: '同期中',
    cancelledHint: '自動更新は停止中です。期間終了後にダウングレードされます。',
  },
} as const;

export const activationUiCopy = {
  zh: {
    title: '国内支付与激活码开通',
    body: '中文用户可通过 Lemon Squeezy 中文专属 checkout 以 $1.99 一次性开通 30 天 Pro，不会自动续费。已收到激活码的用户仍可在站内兑换。',
    stepBuy: '完成 Lemon Squeezy checkout',
    stepReceive: '支付成功后等待同步',
    stepRedeem: '如有激活码，也可登录后兑换',
    purchaseCta: '开通 Pro',
    renewCta: '再开通 30 天 Pro',
    redeemCta: '输入激活码',
    signInFirst: '先登录再兑换',
    subscriptionHint: '当前账号通过激活码开通，无自动续费。',
    modalEyebrow: 'Activation',
    modalTitle: '兑换激活码',
    modalBody: '请输入我发送给你的激活码。兑换成功后，当前账号会立即获得或延长 30 天 Pro 会员。',
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
