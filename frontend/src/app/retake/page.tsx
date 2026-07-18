'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  ImageOff,
  RefreshCw,
  Repeat2,
  ScanSearch,
  Sparkles,
  Target,
} from 'lucide-react';
import { getMyReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import { buildRetakeWorkspaceHref, getEligibleRetakeSources } from '@/lib/retake-coach';
import type { RetakeDimensionKey, ReviewHistoryItem } from '@/lib/types';

const DIMENSIONS: RetakeDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

function getWeakestDimension(item: ReviewHistoryItem): RetakeDimensionKey {
  return DIMENSIONS.reduce((weakest, key) => (
    item.scores[key] < item.scores[weakest] ? key : weakest
  ), DIMENSIONS[0]);
}

function SourceCard({ item }: { item: ReviewHistoryItem }) {
  const { locale } = useI18n();
  const copy = getRetakeCoachCopy(locale);
  const date = new Date(item.created_at).toLocaleDateString(
    locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' }
  );
  const targetDimension = getWeakestDimension(item);

  return (
    <Link
      href={buildRetakeWorkspaceHref(item)}
      prefetch={false}
      className="group overflow-hidden rounded-feature border border-border-subtle bg-raised/65 shadow-level-1 transition-all duration-300 hover:-translate-y-1 hover:border-sage/45 hover:shadow-level-2"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-void/50">
        {item.photo_url ? (
          <Image
            src={item.photo_thumbnail_url ?? item.photo_url}
            alt={copy.originalAlt}
            fill
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
            className="object-cover transition-transform duration-700 group-hover:scale-[1.035]"
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center text-ink-subtle">
            <ImageOff size={24} />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-end gap-2 text-white">
          <span className="font-display text-3xl leading-none">{item.final_score.toFixed(1)}</span>
          <span className="pb-0.5 text-[10px] uppercase tracking-[0.16em] text-white/70">{copy.score}</span>
        </div>
        {item.source_review_id && (
          <span className="absolute right-3 top-3 rounded-full border border-white/20 bg-black/45 px-2.5 py-1 text-[10px] text-white backdrop-blur-md">
            {copy.compared}
          </span>
        )}
      </div>
      <div className="p-4">
        <p className="mb-3 flex items-center gap-2 rounded-control border border-border-subtle bg-surface/70 px-3 py-2 text-xs text-ink-muted">
          <Target size={13} className="shrink-0 text-gold" aria-hidden="true" />
          <span><span className="font-semibold text-ink">{copy.target}:</span> {copy.dimensions[targetDimension]}</span>
        </p>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-ink-subtle">{date}</p>
            <p className="mt-1 text-sm text-ink-muted">{item.image_type.replace('_', ' ')}</p>
          </div>
          <span className="inline-flex min-h-11 items-center gap-2 rounded-control border border-sage/30 bg-sage/10 px-3 py-2 text-xs font-semibold text-sage transition-colors group-hover:bg-sage group-hover:text-void">
            {copy.select}
            <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function SourceSkeleton() {
  return (
    <div className="overflow-hidden rounded-feature border border-border-subtle bg-raised/45">
      <div className="aspect-[4/3] shimmer" />
      <div className="space-y-3 p-4">
        <div className="h-3 w-24 rounded shimmer" />
        <div className="h-8 w-full rounded-full shimmer" />
      </div>
    </div>
  );
}

export default function RetakeCoachPage() {
  const { ensureToken, userInfo } = useAuth();
  const { t, locale } = useI18n();
  const copy = getRetakeCoachCopy(locale);
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const token = await ensureToken();
      const data = await getMyReviews(token, { limit: 24 });
      setItems(data.items);
    } catch (err) {
      setError(formatUserFacingError(t, err, copy.error));
    } finally {
      setLoading(false);
    }
  }, [copy.error, ensureToken, t]);

  useEffect(() => {
    void loadSources();
  }, [loadSources, userInfo?.access_token]);

  const sources = useMemo(() => getEligibleRetakeSources(items), [items]);

  return (
    <div className="min-h-screen">
      <section className="border-b border-border-subtle px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-workspace">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-sage">
              <ScanSearch size={13} />
              {copy.label}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-raised/60 px-3 py-1.5 text-[11px] text-ink-muted">
              <Sparkles size={12} className="text-gold" />
              {copy.modelBadge}
            </span>
          </div>
          <h1 className="mt-7 max-w-3xl text-balance font-display text-4xl leading-[1.04] text-ink sm:text-6xl">
            {copy.title}
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">{copy.body}</p>

          <ol className="mt-10 grid gap-px overflow-hidden rounded-feature border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-4" aria-label={copy.title}>
            {copy.steps.map((step, index) => (
              <li key={step} className="flex items-center gap-3 bg-surface px-5 py-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-mono ${
                  index === 0 ? 'border-sage/40 bg-sage/15 text-sage' : 'border-border bg-raised text-ink-subtle'
                }`} aria-hidden="true">
                  {index === 0 ? <Check size={14} /> : `0${index + 1}`}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">{step}</span>
                  <span className="mt-0.5 block text-[11px] text-ink-subtle">
                    {index === 0 ? copy.currentStep : copy.upcomingStep}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-6 py-12 sm:py-16">
        <div className="mx-auto max-w-workspace">
          <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="ui-eyebrow">01 / Original</p>
              <h2 className="mt-2 text-3xl font-semibold text-ink sm:text-4xl">{copy.sourceTitle}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{copy.sourceBody}</p>
            </div>
            {!loading && !error && sources.length > 0 && (
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border-subtle px-3 py-1.5 text-xs text-ink-subtle">
                <Repeat2 size={12} className="text-sage" />
                {sources.length}
              </span>
            )}
          </div>

          {loading ? (
            <div aria-label={copy.loading} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, index) => <SourceSkeleton key={index} />)}
            </div>
          ) : error ? (
            <div role="alert" className="rounded-feature border border-rust/25 bg-rust/5 px-6 py-10 text-center">
              <p className="text-sm text-rust">{error}</p>
              <button
                type="button"
                onClick={() => void loadSources()}
                className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-control border border-rust/30 px-4 py-2 text-sm font-semibold text-rust transition-colors hover:bg-rust/10"
              >
                <RefreshCw size={13} />
                {copy.retry}
              </button>
            </div>
          ) : sources.length === 0 ? (
            <div className="ui-feature-panel px-6 py-14 text-center">
              <Repeat2 size={26} className="mx-auto text-gold" />
              <h2 className="mt-5 font-display text-3xl text-ink">{copy.emptyTitle}</h2>
              <p className="mx-auto mt-3 max-w-lg text-sm leading-7 text-ink-muted">{copy.emptyBody}</p>
              <Link
                href="/workspace"
                className="ui-action-primary mt-6 px-5 py-3 text-sm"
              >
                {copy.firstReview}
                <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {sources.map((item) => <SourceCard key={item.review_id} item={item} />)}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
