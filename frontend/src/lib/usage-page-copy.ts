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
    title: 'Pro 订阅与激活码',
    body: 'Pro 为 $3.99/月，按月自动续费，可随时取消；现有 Pro 用户不受影响。月订阅支付成功后会自动生效，已收到激活码的用户仍可在站内兑换。',
    stepBuy: '完成 Pro 订阅支付',
    stepReceive: '支付成功后自动同步',
    stepRedeem: '已有激活码也可登录后兑换',
    purchaseCta: '开通 Pro',
    renewCta: '继续订阅 Pro',
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
