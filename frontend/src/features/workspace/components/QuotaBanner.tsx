import { Info } from 'lucide-react';
import { planLabel, planColor } from '@/lib/auth-context';
import { UsageResponse } from '@/lib/types';
import Badge from '@/components/ui/Badge';
import { type Translator } from '@/lib/i18n';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProMonthlyUsageNotice from '@/components/billing/ProMonthlyUsageNotice';

interface QuotaBannerProps {
  usage: UsageResponse | null;
  usageError: boolean;
  remainingQuota: number | null;
  totalQuota: number | null;
  reviewMode: 'flash' | 'pro';
  t: Translator;
  signInReturnPath?: string;
}

export function QuotaBanner({ usage, usageError, remainingQuota, totalQuota, reviewMode, t, signInReturnPath = '/workspace' }: QuotaBannerProps) {
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
      {usage?.plan === 'guest' && remainingQuota === 0 && (
        <div className="max-w-xl space-y-3 rounded-control border border-gold/20 bg-gold/5 px-4 py-3">
          <p className="text-sm leading-6 text-ink-muted">{t('quota_modal_body')}</p>
          <ClerkSignInTrigger
            fallbackRedirectUrl={signInReturnPath}
            className="ui-action-secondary min-h-11 px-4 py-2 text-sm"
            signedInClassName="hidden"
          >
            {t('quota_modal_upgrade')}
          </ClerkSignInTrigger>
        </div>
      )}
      {usage && <ProMonthlyUsageNotice usage={usage} t={t} />}
      {usageError && (
        <p className="text-xs text-ink-subtle">
          {`${t('usage_error')} ${t('support_contact_prompt')}`}
        </p>
      )}
    </div>
  );
}
