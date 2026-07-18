'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight, CalendarDays, ChevronRight, Minus, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import CachedThumbnail from '@/components/ui/CachedThumbnail';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import {
  displayDateToIso,
  isoDateToDisplay,
  normalizeDateDisplay,
} from '@/lib/date-filters';
import { useI18n } from '@/lib/i18n';
import type { HistoryGrowthSnapshot } from '@/lib/review-growth';
import {
  getHistoryCopy,
  getHistoryIntlLocale,
  getImageTypeLabel,
  type ReviewHistoryGrowthCopy,
  type ReviewHistoryPracticeThemeCopy,
} from '@/lib/review-history-copy';
import type { ReviewHistoryItem } from '@/lib/types';

export function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color = score >= 8 ? 'bg-sage' : score >= 6 ? 'bg-gold' : 'bg-rust';

  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 font-display text-base text-ink">{score.toFixed(1)}</span>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DateFilterField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const nativeValue = displayDateToIso(value) ?? '';

  return (
    <label className="min-w-0 space-y-2 text-xs text-ink-muted">
      <span>{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder="yyyy/mm/dd"
          value={value}
          onChange={(event) => onChange(normalizeDateDisplay(event.target.value))}
          aria-invalid={Boolean(error)}
          className={`w-full min-w-0 rounded-xl border bg-void/60 px-3 py-2.5 pr-10 text-[13px] text-ink [font-variant-numeric:tabular-nums] outline-none transition-colors placeholder:text-ink-subtle ${
            error ? 'border-rust/60 focus:border-rust' : 'border-border focus:border-gold/40'
          }`}
        />
        <button
          type="button"
          aria-label={`${label} calendar`}
          onClick={() => {
            const input = nativeInputRef.current;
            if (!input) return;
            input.showPicker?.();
            input.focus();
            input.click();
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-subtle transition-colors hover:text-gold"
        >
          <CalendarDays size={14} />
        </button>
        <input
          ref={nativeInputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={nativeValue}
          onChange={(event) => onChange(isoDateToDisplay(event.target.value))}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </div>
      {error && <p className="text-[11px] leading-5 text-rust">{error}</p>}
    </label>
  );
}

export function ReviewCard({ item }: { item: ReviewHistoryItem }) {
  const { locale, t } = useI18n();
  const copy = getHistoryCopy(locale);
  const date = new Date(item.created_at).toLocaleString(getHistoryIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link
      href={`/reviews/${item.review_id}?back=/account/reviews`}
      prefetch={false}
      className="group flex items-center gap-4 rounded-lg border border-border-subtle bg-raised px-4 py-3 transition-all hover:border-gold/40 hover:bg-raised/80"
    >
      <CachedThumbnail
        photoId={item.photo_id}
        photoUrl={item.photo_thumbnail_url ?? item.photo_url}
        fallbackUrl={item.photo_url}
        alt={t('photo_thumbnail_alt')}
        sourceIsThumbnail={Boolean(item.photo_thumbnail_url)}
      />

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge mode={item.mode} />
          <StatusBadge status={item.status} />
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">
            {getImageTypeLabel(locale, item.image_type)}
          </span>
          {item.is_shared && (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
              {copy.shared}
            </span>
          )}
          {item.source_review_id && (
            <span className="rounded-full border border-sage/30 bg-sage/10 px-2 py-0.5 text-[11px] text-sage">
              {copy.followUp}
            </span>
          )}
          {item.gallery_visible && item.gallery_audit_status === 'rejected' && (
            <span className="rounded-full border border-rust/30 bg-rust/10 px-2 py-0.5 text-[11px] font-medium text-rust">
              {copy.galleryRejected}
            </span>
          )}
        </div>

        {item.status === 'SUCCEEDED' && <ScoreBar score={item.final_score} />}

        <p className="text-xs font-mono text-ink-subtle">{date}</p>
      </div>

      <ChevronRight
        size={16}
        className="shrink-0 text-ink-subtle transition-colors group-hover:text-gold"
      />
    </Link>
  );
}

export function ReviewHistorySkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-[88px] w-full" />
      ))}
    </div>
  );
}

export function ReviewGrowthPanel({
  growthCopy,
  practiceThemeCopy,
  growthSnapshot,
  dimensionLabels,
  locale,
}: {
  growthCopy: ReviewHistoryGrowthCopy;
  practiceThemeCopy: ReviewHistoryPracticeThemeCopy;
  growthSnapshot: HistoryGrowthSnapshot;
  dimensionLabels: Record<string, string>;
  locale: string;
}) {
  return (
    <section className="mb-6 rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(104,169,136,0.14),transparent_38%),rgb(var(--color-surface)/0.76)] p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-sage/80">{growthCopy.label}</p>
          <h2 className="font-display text-2xl text-ink">{growthCopy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-muted">{growthCopy.body}</p>
          <p className="mt-2 inline-flex rounded-full border border-sage/20 bg-sage/10 px-3 py-1 text-[11px] font-medium text-sage">
            {practiceThemeCopy.windowLabel}
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
          growthSnapshot.trend === 'up'
            ? 'border-sage/30 bg-sage/10 text-sage'
            : growthSnapshot.trend === 'down'
              ? 'border-rust/30 bg-rust/10 text-rust'
              : 'border-border bg-raised/70 text-ink-muted'
        }`}>
          {growthSnapshot.trend === 'up' ? (
            <TrendingUp size={13} />
          ) : growthSnapshot.trend === 'down' ? (
            <TrendingDown size={13} />
          ) : (
            <Minus size={13} />
          )}
          <span>
            {growthSnapshot.trend === 'up'
              ? growthCopy.trendUp
              : growthSnapshot.trend === 'down'
                ? growthCopy.trendDown
                : growthCopy.trendFlat}
          </span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border-subtle bg-raised/80 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-subtle">{growthCopy.recentAverage}</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-4xl text-ink">
                {growthSnapshot.recentAverage?.toFixed(1) ?? '-'}
              </span>
              <span className="pb-1 text-sm text-ink-subtle">{growthCopy.averageLabel}</span>
            </div>
          </div>

          <div className="rounded-2xl border border-border-subtle bg-raised/80 p-4">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-subtle">{growthCopy.previousAverage}</p>
            <div className="mt-3 flex items-end gap-2">
              <span className="font-display text-4xl text-ink">
                {growthSnapshot.previousAverage?.toFixed(1) ?? '-'}
              </span>
              <span className="pb-1 text-sm text-ink-subtle">{growthCopy.averageLabel}</span>
            </div>
            <p className="mt-3 text-xs text-ink-subtle">
              {growthSnapshot.previousAverage === null
                ? growthCopy.emptyPrevious
                : `${growthSnapshot.averageDelta && growthSnapshot.averageDelta > 0 ? '+' : ''}${growthSnapshot.averageDelta?.toFixed(1) ?? '0.0'}`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border-subtle bg-void/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm text-ink">
            <ArrowUpRight size={15} className="text-gold" />
            <span>{growthCopy.commonGaps}</span>
          </div>
          <div className="space-y-3">
            {growthSnapshot.weakDimensions.length > 0 ? (
              growthSnapshot.weakDimensions.map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-raised/80 px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{dimensionLabels[item.key]}</p>
                    <p className="mt-1 text-xs text-ink-subtle">{growthCopy.lowCountLabel(item.lowCount)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-2xl text-ink">{item.average.toFixed(1)}</p>
                    <p className="text-[11px] text-ink-subtle">{growthCopy.averageLabel}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-2xl border border-border-subtle bg-raised/80 px-4 py-3 text-xs leading-6 text-ink-muted">
                {practiceThemeCopy.noWeak}
              </p>
            )}
            <div className="rounded-2xl border border-gold/25 bg-gold/10 px-4 py-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-gold">
                <Target size={14} />
                <span>{practiceThemeCopy.practiceLabel}</span>
              </div>
              <p className="font-display text-xl text-ink">{practiceThemeCopy.title}</p>
              <p className="mt-2 text-xs leading-6 text-ink-muted">{practiceThemeCopy.body}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-border-subtle bg-void/30 p-4">
        <p className="mb-3 text-sm text-ink">{growthCopy.recentList}</p>
        <div className="space-y-2">
          {growthSnapshot.recentItems.map((item) => (
            <Link
              key={item.review_id}
              href={`/reviews/${item.review_id}?back=/account/reviews`}
              prefetch={false}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-raised/80 px-4 py-3 transition-colors hover:border-gold/30"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <ModeBadge mode={item.mode} />
                  <StatusBadge status={item.status} />
                </div>
                <p className="mt-2 text-xs text-ink-subtle">
                  {new Date(item.created_at).toLocaleString(getHistoryIntlLocale(locale), {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-ink">{item.final_score.toFixed(1)}</p>
                <p className="text-[11px] text-ink-subtle">{growthCopy.averageLabel}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
