'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowUpRight, CalendarDays, ChevronRight, Minus, RefreshCw, SlidersHorizontal, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { getMyReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ImageType, ReviewHistoryItem, ReviewHistoryQuery } from '@/lib/types';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import CachedThumbnail from '@/components/ui/CachedThumbnail';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildHistoryGrowthSnapshot } from '@/lib/review-growth';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { getProUpgradeTriggerCopy } from '@/lib/pro-conversion';

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

function normalizeDateDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  if (digits.length <= 4) return year;
  if (digits.length <= 6) return `${year}/${month}`;
  return `${year}/${month}/${day}`;
}

function displayDateToIso(value: string): string | null {
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return isoDate;
}

function isoDateToDisplay(value: string): string {
  return value.replace(/-/g, '/');
}

function isInvalidCompletedDate(value: string): boolean {
  return value.length === 10 && displayDateToIso(value) === null;
}

function toQuery(filters: FilterDraft): ReviewHistoryQuery {
  const query: ReviewHistoryQuery = { limit: 20 };

  const createdFromIso = displayDateToIso(filters.createdFrom);
  const createdToIso = displayDateToIso(filters.createdTo);

  if (createdFromIso) {
    query.created_from = new Date(`${createdFromIso}T00:00:00`).toISOString();
  }
  if (createdToIso) {
    query.created_to = new Date(`${createdToIso}T23:59:59.999`).toISOString();
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

function getHistoryGrowthCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Growth Loop',
      title: '直近 3 回をひとつの流れで見る',
      body: '平均点が上向いているか、どの次元が繰り返し足を引っ張っているかを先に確認します。',
      recentAverage: '直近 3 回の平均',
      previousAverage: 'その前 3 回の平均',
      recentList: '直近 3 回の講評',
      commonGaps: '繰り返し弱い次元',
      trendUp: '前のまとまりより上向き',
      trendDown: '前のまとまりより下振れ',
      trendFlat: 'まだ横ばい',
      averageLabel: '平均',
      lowCountLabel: (count: number) => `${count} 回で 7 未満`,
      emptyPrevious: '比較用の 3 回がまだありません',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Growth Loop',
      title: 'Read the last three critiques as one loop',
      body: 'Check whether the average is moving up first, then which dimensions keep slipping below a good score.',
      recentAverage: 'Recent 3 average',
      previousAverage: 'Previous 3 average',
      recentList: 'Most recent three critiques',
      commonGaps: 'Dimensions that keep dragging',
      trendUp: 'Stronger than the previous batch',
      trendDown: 'Weaker than the previous batch',
      trendFlat: 'Still flat',
      averageLabel: 'Avg',
      lowCountLabel: (count: number) => `${count} reviews under 7`,
      emptyPrevious: 'Need three more critiques to compare the previous batch',
    };
  }
  return {
    label: '连续进步',
    title: '把最近 3 次点评连成一条线看',
    body: '先看平均分有没有往上走，再看哪些维度在反复拖后腿。',
    recentAverage: '最近 3 次均分',
    previousAverage: '之前 3 次均分',
    recentList: '最近 3 次点评',
    commonGaps: '反复掉分的维度',
    trendUp: '比上一轮更稳',
    trendDown: '比上一轮更弱',
    trendFlat: '还在平台期',
    averageLabel: '均分',
    lowCountLabel: (count: number) => `${count} 次低于 7 分`,
    emptyPrevious: '还没有足够的上一轮数据可供对比',
  };
}

function getHistoryPracticeThemeCopy(
  locale: 'zh' | 'en' | 'ja',
  dimensionLabel: string,
  intensity: 'recover' | 'stabilize' | 'extend',
  isPro: boolean,
  analyzedCount: number,
  totalCount: number,
) {
  if (locale === 'ja') {
    const action = intensity === 'recover' ? '立て直す' : intensity === 'extend' ? '伸ばす' : '安定させる';
    return {
      windowLabel: isPro
        ? `Pro long trend · ${analyzedCount} reviews`
        : `Free recent window · ${analyzedCount}/${totalCount} reviews`,
      practiceLabel: 'Next Practice',
      title: `${dimensionLabel}を${action}`,
      body: isPro
        ? '読み込まれている履歴全体から次の練習テーマを選んでいます。'
        : 'Free では直近の履歴で傾向を読みます。長い期間の弱点変化は Pro で確認できます。',
      noWeak: '7 未満の反復弱点はまだありません。最低平均の次元を次の練習候補にしています。',
    };
  }
  if (locale === 'en') {
    const action = intensity === 'recover' ? 'recover' : intensity === 'extend' ? 'extend' : 'stabilize';
    return {
      windowLabel: isPro
        ? `Pro long trend · ${analyzedCount} reviews`
        : `Free recent window · ${analyzedCount}/${totalCount} reviews`,
      practiceLabel: 'Next Practice',
      title: `${action} ${dimensionLabel}`,
      body: isPro
        ? 'This practice theme is calculated from the loaded long-term history.'
        : 'Free reads the recent window. Pro keeps the longer trail so weak dimensions can be compared across more shoots.',
      noWeak: 'No repeated dimension is under 7 yet. The lowest average dimension becomes the next practice candidate.',
    };
  }
  const action = intensity === 'recover' ? '拉回' : intensity === 'extend' ? '继续放大' : '稳定';
  return {
    windowLabel: isPro
      ? `Pro 长周期趋势 · ${analyzedCount} 条记录`
      : `Free 最近窗口 · ${analyzedCount}/${totalCount} 条记录`,
    practiceLabel: '下一轮练习',
    title: `${action}${dimensionLabel}`,
    body: isPro
      ? '当前练习主题来自已加载的完整历史窗口，更适合观察长期弱项是否改善。'
      : 'Free 先用最近窗口判断趋势；升级 Pro 后可以用更长历史追踪弱项和复拍进步。',
    noWeak: '目前没有反复低于 7 分的维度，已用平均分最低的维度作为下一轮练习候选。',
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

function DateFilterField({
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

function ReviewCard({ item }: { item: ReviewHistoryItem }) {
  const { locale, t } = useI18n();
  const copy = getHistoryCopy(locale);
  const galleryRejectedLabel =
    locale === 'ja' ? 'ギャラリー審査未通過' : locale === 'en' ? 'Gallery rejected' : '长廊审核未通过';
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
          {item.gallery_visible && item.gallery_audit_status === 'rejected' && (
            <span className="rounded-full border border-rust/30 bg-rust/10 px-2 py-0.5 text-[11px] font-medium text-rust">
              {galleryRejectedLabel}
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
  const growthCopy = useMemo(() => getHistoryGrowthCopy(locale), [locale]);
  const plan = userInfo?.plan ?? 'guest';
  const historyPromoCopy = useMemo(() => getProUpgradeTriggerCopy(locale, 'history_trend'), [locale]);
  const invalidDateCopy =
    locale === 'ja'
      ? '有効な日付を yyyy/mm/dd 形式で入力してください'
      : locale === 'en'
        ? 'Enter a valid date in yyyy/mm/dd format'
        : '请输入有效日期，格式为 yyyy/mm/dd';

  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const createdFromInvalid = isInvalidCompletedDate(draftFilters.createdFrom);
  const createdToInvalid = isInvalidCompletedDate(draftFilters.createdTo);
  const hasInvalidDate = createdFromInvalid || createdToInvalid;
  const dimensionLabels = useMemo(
    () => ({
      composition: t('score_composition'),
      lighting: t('score_lighting'),
      color: t('score_color'),
      impact: t('score_impact'),
      technical: t('score_technical'),
    }),
    [t]
  );
  const growthWindowItems = useMemo(() => {
    const sortedItems = [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return plan === 'pro' ? sortedItems : sortedItems.slice(0, 6);
  }, [items, plan]);
  const growthSnapshot = useMemo(() => buildHistoryGrowthSnapshot(growthWindowItems), [growthWindowItems]);
  const practiceThemeCopy = useMemo(
    () => getHistoryPracticeThemeCopy(
      locale,
      dimensionLabels[growthSnapshot.practiceTheme.dimension],
      growthSnapshot.practiceTheme.intensity,
      plan === 'pro',
      growthSnapshot.practiceTheme.reviewCount,
      items.length,
    ),
    [dimensionLabels, growthSnapshot.practiceTheme, items.length, locale, plan]
  );

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

        <section className="mb-6 rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_35%),rgb(var(--color-surface)/0.72)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-ink">
            <SlidersHorizontal size={15} className="text-gold" />
            <span>{copy.filtersLabel}</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
            <DateFilterField
              label={copy.from}
              value={draftFilters.createdFrom}
              error={createdFromInvalid ? invalidDateCopy : undefined}
              onChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, createdFrom: value }))
              }
            />

            <DateFilterField
              label={copy.to}
              value={draftFilters.createdTo}
              error={createdToInvalid ? invalidDateCopy : undefined}
              onChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, createdTo: value }))
              }
            />

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
                className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
                className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
                className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
              disabled={hasInvalidDate}
              className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50"
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

        {!loading && !error && items.length > 0 && (
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
                      {growthSnapshot.recentAverage?.toFixed(1) ?? '—'}
                    </span>
                    <span className="pb-1 text-sm text-ink-subtle">{growthCopy.averageLabel}</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-border-subtle bg-raised/80 p-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-ink-subtle">{growthCopy.previousAverage}</p>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="font-display text-4xl text-ink">
                      {growthSnapshot.previousAverage?.toFixed(1) ?? '—'}
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
                        {new Date(item.created_at).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US', {
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
        )}

        {!loading && !error && items.length > 0 && plan !== 'pro' && (
          <ProPromoCard
            plan={plan === 'guest' ? 'guest' : 'free'}
            scene="usage"
            title={historyPromoCopy.title}
            body={historyPromoCopy.body}
            fallbackRedirectUrl="/account/reviews"
            className="mb-6"
          />
        )}

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
