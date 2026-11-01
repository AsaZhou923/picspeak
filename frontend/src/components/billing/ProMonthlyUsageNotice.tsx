import type { Translator } from '@/lib/i18n';
import type { UsageResponse } from '@/lib/types';

export default function ProMonthlyUsageNotice({ usage, t }: {
  usage: Pick<UsageResponse, 'plan' | 'quota'>;
  t: Translator;
}) {
  const { monthly_soft_limit: limit, monthly_soft_used: used, monthly_soft_reached: reached, monthly_soft_rate_limit_per_minute: rate } = usage.quota;
  if (usage.plan !== 'pro' || limit == null || used == null || reached == null) return null;

  return (
    <div className="rounded-control border border-border-subtle bg-surface/60 px-4 py-3 text-xs leading-6">
      <p className="font-medium text-ink">
        {t('usage_pro_soft_counter').replace('{used}', String(used)).replace('{limit}', String(limit))}
      </p>
      <p role={reached ? 'status' : undefined} className="text-ink-muted">
        {rate != null && rate > 0
          ? t(reached ? 'usage_pro_soft_reached' : 'usage_pro_soft_hint').replace('{rate}', String(rate))
          : t('usage_pro_soft_unknown_rate')}
      </p>
    </div>
  );
}
