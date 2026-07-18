'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, RefreshCw, Repeat2, SlidersHorizontal } from 'lucide-react';
import { getMyReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ImageType, ReviewHistoryItem, ReviewHistoryQuery } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildHistoryGrowthSnapshot } from '@/lib/review-growth';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { getProUpgradeTriggerCopy } from '@/lib/pro-conversion';
import {
  displayDateToIso,
  isInvalidCompletedDate,
} from '@/lib/date-filters';
import {
  getHistoryCopy,
  getHistoryGrowthCopy,
  getHistoryPracticeThemeCopy,
  getImageTypeLabel,
} from '@/lib/review-history-copy';
import {
  DateFilterField,
  ReviewCard,
  ReviewGrowthPanel,
  ReviewHistorySkeletonList,
} from '@/features/reviews/components/ReviewHistoryPanels';
import { RetakeProgressPanel } from '@/features/reviews/components/RetakeProgressPanel';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';

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

export default function ReviewHistoryPage() {
  const { ensureToken, userInfo } = useAuth();
  const { t, locale } = useI18n();
  const copy = useMemo(() => getHistoryCopy(locale), [locale]);
  const retakeCopy = useMemo(() => getRetakeCoachCopy(locale), [locale]);
  const growthCopy = useMemo(() => getHistoryGrowthCopy(locale), [locale]);
  const plan = userInfo?.plan ?? 'guest';
  const historyPromoCopy = useMemo(() => getProUpgradeTriggerCopy(locale, 'history_trend'), [locale]);

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
    <div className="min-h-screen">
      <div className="mx-auto max-w-task px-6 py-12 animate-fade-in">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="ui-eyebrow mb-2">
              {t('account_reviews_label')}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">{t('account_reviews_headline')}</h1>
          </div>
          <Link
            href="/retake"
            className="ui-action-secondary w-fit border-sage/35 px-4 py-2.5 text-sm text-sage hover:bg-sage/10"
          >
            <Repeat2 size={14} />
            {retakeCopy.historyCta}
          </Link>
        </div>

        <section className="ui-panel mb-6 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-ink">
            <SlidersHorizontal size={15} className="text-gold" />
            <span>{copy.filtersLabel}</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
            <DateFilterField
              label={copy.from}
              value={draftFilters.createdFrom}
              error={createdFromInvalid ? copy.invalidDate : undefined}
              onChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, createdFrom: value }))
              }
            />

            <DateFilterField
              label={copy.to}
              value={draftFilters.createdTo}
              error={createdToInvalid ? copy.invalidDate : undefined}
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
                className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
                className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
                className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
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
              className="ui-action-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copy.apply}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="ui-action-secondary px-4 py-2 text-sm"
            >
              {copy.reset}
            </button>
          </div>
        </section>

        {!loading && !error && items.length > 0 && (
          <RetakeProgressPanel items={items} locale={locale} />
        )}

        {!loading && !error && items.length > 0 && (
          <ReviewGrowthPanel
            growthCopy={growthCopy}
            practiceThemeCopy={practiceThemeCopy}
            growthSnapshot={growthSnapshot}
            dimensionLabels={dimensionLabels}
            locale={locale}
          />
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
          <ReviewHistorySkeletonList />
        ) : error ? (
          <div className="flex items-center gap-2 rounded border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="ui-panel space-y-3 px-6 py-16 text-center">
            <p className="text-sm text-ink-subtle">{t('reviews_empty')}</p>
            <Link
              href="/workspace"
              className="ui-action-primary px-3 py-1.5 text-xs"
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
                  className="ui-action-secondary mx-auto px-5 py-2 text-sm disabled:opacity-50"
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
