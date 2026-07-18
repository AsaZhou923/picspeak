import { Info } from 'lucide-react';
import { planLabel, planColor } from '@/lib/auth-context';
import { UsageResponse } from '@/lib/types';
import Badge from '@/components/ui/Badge';
import { type Translator } from '@/lib/i18n';

interface QuotaBannerProps {
  usage: UsageResponse | null;
  usageError: boolean;
  remainingQuota: number | null;
  totalQuota: number | null;
  reviewMode: 'flash' | 'pro';
  t: Translator;
}

export function QuotaBanner({ usage, usageError, remainingQuota, totalQuota, reviewMode, t }: QuotaBannerProps) {
  return (
    <div className="mt-5 space-y-2">
      {usage && (
        <div className="inline-flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-border-subtle bg-surface/60 px-3 py-2 shadow-level-1">
          <span className="flex items-center gap-1.5 text-xs font-bold">
            <span className={`font-medium ${planColor(usage.plan)}`}>{planLabel(usage.plan)}</span>
          </span>
          <span className="h-4 w-px bg-border-subtle" aria-hidden="true" />
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Info size={13} className="text-gold" aria-hidden="true" />
            <span className="font-bold text-ink">{reviewMode === 'pro' ? 'Pro' : 'Flash'}</span>
            <span>{t('usage_remaining')}</span>
            <span className="text-ink font-medium">
              {remainingQuota ?? '∞'}{totalQuota !== null ? ` / ${totalQuota}` : ''}
            </span>
            {t('usage_times')}
          </div>
          {remainingQuota === 0 && <Badge variant="rust">{t('usage_quota_exhausted')}</Badge>}
        </div>
      )}
      {usageError && (
        <p className="text-xs text-ink-subtle">
          {`${t('usage_error')} ${t('support_contact_prompt')}`}
        </p>
      )}
    </div>
  );
}
