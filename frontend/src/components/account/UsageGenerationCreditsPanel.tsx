'use client';

import { Coins } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Translator } from '@/lib/i18n';
import type { UsageResponse } from '@/lib/types';

type GenerationCredits = UsageResponse['generation_credits'];

type UsageGenerationCreditsPanelProps = {
  t: Translator;
  plan: UsageResponse['plan'];
  generationCredits: GenerationCredits;
  creditPackBusy: boolean;
  loadingCurrency: 'usd' | null;
  onCreditPackCheckout: () => void;
  renderUsageBar: (props: { label: string; used: number; total: number }) => ReactNode;
};

export default function UsageGenerationCreditsPanel({
  t,
  plan,
  generationCredits,
  creditPackBusy,
  loadingCurrency,
  onCreditPackCheckout,
  renderUsageBar,
}: UsageGenerationCreditsPanelProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-gold/25 bg-[linear-gradient(135deg,rgba(200,162,104,0.16),transparent_44%),rgb(var(--color-raised)/0.78)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex max-w-md items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
            <Coins size={18} />
          </span>
          <div>
            <p className="text-sm font-medium text-ink">{t('usage_generation_credits_title')}</p>
            <p className="mt-1 text-xs leading-5 text-ink-muted">{t('usage_generation_credits_body')}</p>
          </div>
        </div>
        <div className="min-w-[150px] text-left sm:text-right">
          <p className="font-display text-4xl text-gold">
            {generationCredits.monthly_remaining ?? 0}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {t('usage_generation_credits_monthly_remaining').replace(
              '{total}',
              String(generationCredits.monthly_total ?? 0),
            )}
          </p>
        </div>
      </div>

      {generationCredits.monthly_total !== null &&
        generationCredits.monthly_total > 0 &&
        generationCredits.monthly_used !== null && (
          <div className="mt-5">
            {renderUsageBar({
              label: t('usage_generation_credits_monthly_used'),
              used: generationCredits.monthly_used,
              total: generationCredits.monthly_total,
            })}
          </div>
        )}

      <p className="mt-4 rounded-md border border-border-subtle bg-void/25 px-3 py-2 text-xs leading-5 text-ink-muted">
        {plan === 'guest'
          ? t('usage_generation_credits_guest_hint')
          : t('usage_generation_credits_pricing_hint')}
      </p>
      {plan !== 'guest' && (
        <div className="mt-4 rounded-lg border border-border-subtle bg-void/25 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">
                {t('usage_credit_pack_title')}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-muted">
                {t('usage_credit_pack_body')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onCreditPackCheckout}
                disabled={creditPackBusy}
                className="rounded-full border border-gold/30 px-4 py-2 text-xs font-medium text-gold transition-colors hover:bg-gold/10 disabled:opacity-60"
              >
                {loadingCurrency === 'usd' ? t('usage_checkout_loading') : t('usage_credit_pack_button')}
              </button>
              <span className="self-center text-xs text-ink-subtle">{t('usage_credit_pack_payment_hint')}</span>
            </div>
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-subtle">
            {t('usage_credit_pack_refresh_hint')}
          </p>
        </div>
      )}
    </div>
  );
}
