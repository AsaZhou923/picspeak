'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { getMyReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ImageType, ReviewHistoryItem, ReviewHistoryQuery } from '@/lib/types';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import CachedThumbnail from '@/components/ui/CachedThumbnail';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';

type FilterDraft = {
  createdFrom: string;
  createdTo: string;
  minScore: string;
  maxScore: string;
  imageType: '' | ImageType;
};

const EMPTY_FILTERS: FilterDraft = {
  createdFrom: '',
  createdTo: '',
  minScore: '',
  maxScore: '',
  imageType: '',
};

function toQuery(filters: FilterDraft): ReviewHistoryQuery {
  const query: ReviewHistoryQuery = { limit: 20 };

  if (filters.createdFrom) {
    query.created_from = new Date(`${filters.createdFrom}T00:00:00`).toISOString();
  }
  if (filters.createdTo) {
    query.created_to = new Date(`${filters.createdTo}T23:59:59.999`).toISOString();
  }
  if (filters.minScore !== '') {
    query.min_score = Number(filters.minScore);
  }
  if (filters.maxScore !== '') {
    query.max_score = Number(filters.maxScore);
  }
  if (filters.imageType) {
    query.image_type = filters.imageType;
  }

  return query;
}

function ScoreBar({ score }: { score: number }) {
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

function getHistoryCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      filtersLabel: '絞り込み',
      from: '開始日',
      to: '終了日',
      minScore: '最低スコア',
      maxScore: '最高スコア',
      imageType: '写真タイプ',
      allTypes: 'すべて',
      apply: '適用',
      reset: 'リセット',
      shared: '共有済み',
      followUp: '再分析元',
    };
  }
  if (locale === 'en') {
    return {
      filtersLabel: 'Filters',
      from: 'From',
      to: 'To',
      minScore: 'Min score',
      maxScore: 'Max score',
      imageType: 'Image type',
      allTypes: 'All types',
      apply: 'Apply',
      reset: 'Reset',
      shared: 'Shared',
      followUp: 'Linked replay',
    };
  }
  return {
    filtersLabel: '筛选条件',
    from: '开始时间',
    to: '结束时间',
    minScore: '最低评分',
    maxScore: '最高评分',
    imageType: '图片类型',
    allTypes: '全部类型',
    apply: '应用筛选',
    reset: '重置',
    shared: '已分享',
    followUp: '关联复盘',
  };
}

function getImageTypeLabel(locale: 'zh' | 'en' | 'ja', imageType?: ImageType) {
  const normalized = imageType ?? 'default';
  const zh: Record<ImageType, string> = {
    default: '默认',
    landscape: '风景',
    portrait: '人像',
    street: '街拍',
    still_life: '静物',
    architecture: '建筑',
  };
  const en: Record<ImageType, string> = {
    default: 'Default',
    landscape: 'Landscape',
    portrait: 'Portrait',
    street: 'Street',
    still_life: 'Still Life',
    architecture: 'Architecture',
  };
  const ja: Record<ImageType, string> = {
    default: '標準',
    landscape: '風景',
    portrait: 'ポートレート',
    street: 'ストリート',
    still_life: '静物',
    architecture: '建築',
  };
  if (locale === 'ja') return ja[normalized];
  if (locale === 'en') return en[normalized];
  return zh[normalized];
}

function ReviewCard({ item }: { item: ReviewHistoryItem }) {
  const { locale, t } = useI18n();
  const copy = getHistoryCopy(locale);
  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  const date = new Date(item.created_at).toLocaleString(dateLocale, {
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

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-[88px] w-full" />
      ))}
    </div>
  );
}

export default function ReviewHistoryPage() {
  const { ensureToken, userInfo } = useAuth();
  const { t, locale } = useI18n();
  const copy = useMemo(() => getHistoryCopy(locale), [locale]);

  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_FILTERS);

  const fetchPage = useCallback(
    async (nextCursor?: string, activeFilters: FilterDraft = appliedFilters) => {
      try {
        const token = await ensureToken();
        const data = await getMyReviews(token, {
          ...toQuery(activeFilters),
          cursor: nextCursor,
        });

        if (nextCursor) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }

        setCursor(data.next_cursor);
        setHasMore(data.next_cursor !== null);
        setError('');
      } catch (err) {
        setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
      }
    },
    [appliedFilters, ensureToken, t]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError('');
    setLoading(true);
    fetchPage(undefined, appliedFilters).finally(() => setLoading(false));
  }, [fetchPage, appliedFilters, userInfo?.access_token]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const handleResetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">
        <div className="mb-10">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-gold/70">
            {t('account_reviews_label')}
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">{t('account_reviews_headline')}</h1>
        </div>

        <section className="mb-6 rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_35%),rgba(18,16,13,0.72)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-ink">
            <SlidersHorizontal size={15} className="text-gold" />
            <span>{copy.filtersLabel}</span>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{copy.from}</span>
              <input
                type="date"
                value={draftFilters.createdFrom}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, createdFrom: event.target.value }))
                }
                className="date-field w-full min-w-0 rounded-xl border border-border bg-void/50 px-3 py-2.5 pr-11 font-mono text-sm text-ink [font-variant-numeric:tabular-nums] outline-none transition-colors focus:border-gold/40"
              />
            </label>

            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{copy.to}</span>
              <input
                type="date"
                value={draftFilters.createdTo}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, createdTo: event.target.value }))
                }
                className="date-field w-full min-w-0 rounded-xl border border-border bg-void/50 px-3 py-2.5 pr-11 font-mono text-sm text-ink [font-variant-numeric:tabular-nums] outline-none transition-colors focus:border-gold/40"
              />
            </label>

            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{copy.minScore}</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={draftFilters.minScore}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, minScore: event.target.value }))
                }
                className="w-full min-w-0 rounded-xl border border-border bg-void/50 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
              />
            </label>

            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{copy.maxScore}</span>
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={draftFilters.maxScore}
                onChange={(event) =>
                  setDraftFilters((prev) => ({ ...prev, maxScore: event.target.value }))
                }
                className="w-full min-w-0 rounded-xl border border-border bg-void/50 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
              />
            </label>

            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{copy.imageType}</span>
              <select
                value={draftFilters.imageType}
                onChange={(event) =>
                  setDraftFilters((prev) => ({
                    ...prev,
                    imageType: event.target.value as '' | ImageType,
                  }))
                }
                className="w-full min-w-0 rounded-xl border border-border bg-void/50 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
              >
                <option value="">{copy.allTypes}</option>
                {(['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as ImageType[]).map((type) => (
                  <option key={type} value={type}>
                    {getImageTypeLabel(locale, type)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
            >
              {copy.apply}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
            >
              {copy.reset}
            </button>
          </div>
        </section>

        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="flex items-center gap-2 rounded border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-3 py-20 text-center">
            <p className="text-sm text-ink-subtle">{t('reviews_empty')}</p>
            <Link
              href="/workspace"
              className="inline-flex items-center gap-1.5 rounded border border-gold/30 px-3 py-1.5 text-xs text-gold transition-colors hover:bg-gold/10"
            >
              {t('reviews_empty_cta')}
              <ChevronRight size={11} />
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <ReviewCard key={item.review_id} item={item} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="mx-auto flex items-center gap-2 rounded border border-border px-5 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-50"
                >
                  {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                  {loadingMore ? t('reviews_loading_more') : t('reviews_load_more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
