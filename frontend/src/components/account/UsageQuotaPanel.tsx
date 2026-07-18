'use client';

import type { ReactNode } from 'react';
import type { Translator } from '@/lib/i18n';
import type { UsageResponse } from '@/lib/types';

type UsageQuotaPanelProps = {
  t: Translator;
  usage: UsageResponse;
  reviewModesText: string;
  historyRetentionText: string;
  renderUsageBar: (props: { label: string; used: number; total: number }) => ReactNode;
};

export default function UsageQuotaPanel({
  t,
  usage,
  reviewModesText,
  historyRetentionText,
  renderUsageBar,
}: UsageQuotaPanelProps) {
  return (
    <div className="border border-border-subtle rounded-lg bg-raised p-6 space-y-5">
      {usage.quota.daily_total !== null && usage.quota.daily_used !== null ? (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <span className="font-display text-4xl text-ink">
              {usage.quota.daily_remaining}
            </span>
            <span className="text-ink-muted mb-1.5 text-sm">
              {t('usage_daily_remaining').replace('{total}', String(usage.quota.daily_total))}
            </span>
          </div>
          {renderUsageBar({
            label: t('usage_daily_quota'),
            used: usage.quota.daily_used,
            total: usage.quota.daily_total,
          })}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">{t('usage_daily_quota')}</p>
          <p className="text-sm text-sage">{t('usage_unlimited_daily')}</p>
        </div>
      )}

      {usage.quota.monthly_total !== null && usage.quota.monthly_used !== null && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <span className="font-display text-3xl text-ink">
              {usage.quota.monthly_remaining}
            </span>
            <span className="text-ink-muted mb-1 text-sm">
              {t('usage_monthly_remaining').replace('{total}', String(usage.quota.monthly_total))}
            </span>
          </div>
          {renderUsageBar({
            label: t('usage_monthly_quota'),
            used: usage.quota.monthly_used,
            total: usage.quota.monthly_total,
          })}
        </div>
      )}

      {usage.quota.pro_monthly_total !== null && usage.quota.pro_monthly_used !== null && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <span className="font-display text-3xl text-ink">
              {usage.quota.pro_monthly_remaining}
            </span>
            <span className="text-ink-muted mb-1 text-sm">
              {t('usage_pro_monthly_remaining').replace('{total}', String(usage.quota.pro_monthly_total))}
            </span>
          </div>
          {renderUsageBar({
            label: t('usage_pro_monthly_quota'),
            used: usage.quota.pro_monthly_used,
            total: usage.quota.pro_monthly_total,
          })}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 text-sm">
        <div className="border border-border-subtle rounded-md px-4 py-3">
          <p className="text-xs text-ink-muted mb-1">{t('usage_review_modes')}</p>
          <p>{reviewModesText}</p>
        </div>
        <div className="border border-border-subtle rounded-md px-4 py-3">
          <p className="text-xs text-ink-muted mb-1">{t('usage_history_label')}</p>
          <p>{historyRetentionText}</p>
        </div>
        <div className="border border-border-subtle rounded-md px-4 py-3">
          <p className="text-xs text-ink-muted mb-1">{t('usage_priority_label')}</p>
          <p>{usage.features.priority_queue ? t('usage_priority_yes') : t('usage_priority_no')}</p>
        </div>
      </div>
    </div>
  );
}
