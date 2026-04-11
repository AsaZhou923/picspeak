'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Heart, RefreshCw } from 'lucide-react';
import { getMyReviews, updateReviewMeta } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ImageType, ReviewHistoryItem } from '@/lib/types';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import CachedThumbnail from '@/components/ui/CachedThumbnail';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';

function getFavoritesCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'お気に入り',
      title: 'お気に入りの評図',
      intro: 'あとで見返したい分析結果だけを集めた一覧です。ここから直接お気に入り解除もできます。',
      empty: 'まだお気に入りはありません',
      emptyBody: '気になる評図結果でハートを押すと、ここに集まります。',
      emptyCta: '評図しに行く',
      openReview: '結果を見る',
      remove: '解除',
      loadingMore: 'さらに読み込み中...',
      loadMore: 'さらに読み込む',
      unfavoritePending: 'お気に入りを解除中...',
      unfavoriteDone: 'お気に入りを解除しました',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Favorites',
      title: 'Saved Critiques',
      intro: 'A focused list of the critique results you want to revisit later. You can remove favorites directly here.',
      empty: 'No favorites yet',
      emptyBody: 'Tap the heart on any critique result and it will show up here.',
      emptyCta: 'Start reviewing',
      openReview: 'Open result',
      remove: 'Remove',
      loadingMore: 'Loading more...',
      loadMore: 'Load more',
      unfavoritePending: 'Removing favorite...',
      unfavoriteDone: 'Favorite removed',
    };
  }

  return {
    label: '我的收藏',
    title: '收藏的评图结果',
    intro: '这里集中展示你想反复回看的评图结果，也可以在这里直接取消收藏。',
    empty: '还没有收藏内容',
    emptyBody: '在任意评图结果页点一下心形按钮，就会同步到这里。',
    emptyCta: '去评图',
    openReview: '打开结果',
    remove: '取消收藏',
    loadingMore: '正在加载更多...',
    loadMore: '加载更多',
    unfavoritePending: '正在取消收藏...',
    unfavoriteDone: '已取消收藏',
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

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, index) => (
        <SkeletonBlock key={index} className="h-[102px] w-full" />
      ))}
    </div>
  );
}

export default function FavoritesPage() {
  const { ensureToken, userInfo } = useAuth();
  const { locale, t } = useI18n();
  const copy = useMemo(() => getFavoritesCopy(locale), [locale]);

  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const fetchFavoriteChunk = useCallback(
    async (startCursor?: string | null) => {
      const token = await ensureToken();
      const response = await getMyReviews(token, {
        cursor: startCursor ?? undefined,
        limit: 20,
        favorite_only: true,
      });

      return {
        items: response.items,
        nextCursor: response.next_cursor,
      };
    },
    [ensureToken]
  );

  const loadInitial = useCallback(async () => {
    try {
      setError('');
      setFeedback('');
      const data = await fetchFavoriteChunk();
      setItems(data.items);
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    }
  }, [fetchFavoriteChunk, t]);

  useEffect(() => {
    setLoading(true);
    loadInitial().finally(() => setLoading(false));
  }, [loadInitial, userInfo?.access_token]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await fetchFavoriteChunk(cursor);
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.nextCursor !== null);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleUnfavorite = async (reviewId: string) => {
    if (actionBusyId) return;

    setActionBusyId(reviewId);
    setFeedback(copy.unfavoritePending);
    setError('');

    try {
      const token = await ensureToken();
      await updateReviewMeta(reviewId, { favorite: false }, token);
      setItems((prev) => prev.filter((item) => item.review_id !== reviewId));
      setFeedback(copy.unfavoriteDone);
    } catch (err) {
      setFeedback('');
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setActionBusyId(null);
    }
  };

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-3xl px-6 py-12 animate-fade-in">
        <div className="mb-8 space-y-3">
          <p className="text-xs uppercase tracking-widest text-gold/70">{copy.label}</p>
          <h1 className="font-display text-4xl sm:text-5xl">{copy.title}</h1>
          <p className="max-w-2xl text-sm leading-7 text-ink-muted">{copy.intro}</p>
        </div>

        {(feedback || error) && (
          <div className={`mb-5 rounded-lg border px-4 py-3 text-sm ${error ? 'border-rust/20 bg-rust/5 text-rust' : 'border-sage/20 bg-sage/5 text-sage'}`}>
            {error || feedback}
          </div>
        )}

        {loading ? (
          <SkeletonList />
        ) : items.length === 0 ? (
          <div className="overflow-hidden rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.18),transparent_34%),rgb(var(--color-surface)/0.8)] px-6 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-rust/25 bg-rust/10 text-rust">
              <Heart size={20} />
            </div>
            <h2 className="font-display text-2xl text-ink">{copy.empty}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-ink-muted">{copy.emptyBody}</p>
            <Link
              href="/workspace"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
            >
              {copy.emptyCta}
              <ChevronRight size={13} />
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => {
                const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
                const date = new Date(item.created_at).toLocaleString(dateLocale, {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <div
                    key={item.review_id}
                    className="flex gap-4 rounded-xl border border-border-subtle bg-raised px-4 py-3"
                  >
                    <Link
                      href={`/reviews/${item.review_id}?back=/account/favorites`}
                      prefetch={false}
                      className="flex min-w-0 flex-1 items-center gap-4"
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
                        </div>
                        <ScoreBar score={item.final_score} />
                        <p className="text-xs font-mono text-ink-subtle">{date}</p>
                      </div>
                    </Link>

                    <div className="flex flex-col items-end justify-between gap-3">
                      <Link
                        href={`/reviews/${item.review_id}?back=/account/favorites`}
                        className="text-xs text-gold transition-colors hover:text-gold-light"
                      >
                        {copy.openReview}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleUnfavorite(item.review_id)}
                        disabled={actionBusyId !== null}
                        className="inline-flex items-center gap-2 rounded-full border border-rust/25 bg-rust/10 px-3 py-1.5 text-xs text-rust transition-colors hover:bg-rust/15 disabled:opacity-60"
                      >
                        <Heart size={12} className="fill-current" />
                        {actionBusyId === item.review_id ? copy.unfavoritePending : copy.remove}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="mx-auto flex items-center gap-2 rounded border border-border px-5 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-50"
                >
                  {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                  {loadingMore ? copy.loadingMore : copy.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
