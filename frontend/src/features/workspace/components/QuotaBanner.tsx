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
  t: Translator;
}

export function QuotaBanner({ usage, usageError, remainingQuota, totalQuota, t }: QuotaBannerProps) {
  return (
    <>
      {usage && (
        <div className="flex items-center gap-3 mt-4 flex-wrap">
          <span className="flex items-center gap-1.5 text-xs">
            <span className={`font-medium ${planColor(usage.plan)}`}>{planLabel(usage.plan)}</span>
          </span>
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
            <Info size={11} />
            {t('usage_remaining')}
            <span className="text-ink font-medium">
              {remainingQuota ?? '∞'}{totalQuota !== null ? ` / ${totalQuota}` : ''}
            </span>
            {t('usage_times')}
          </div>
          {remainingQuota === 0 && <Badge variant="rust">{t('usage_quota_exhausted')}</Badge>}
        </div>
      )}
      {usageError && (
        <p className="text-xs text-ink-subtle mt-2">
          {`${t('usage_error')} ${t('support_contact_prompt')}`}
        </p>
      )}
    </>
  );
}
