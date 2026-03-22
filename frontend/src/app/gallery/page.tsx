'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, Heart, LayoutGrid, Star, X } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { getPublicGallery, likeGalleryReview, unlikeGalleryReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import { PublicGalleryItem } from '@/lib/types';

const PAGE_SIZE = 12;

function getGallerySeoCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      title: 'このギャラリーの見方',
      intro:
        '公開ギャラリーは単なる作品一覧ではなく、どの写真がどんな理由で評価されたかを短時間で把握するための学習アーカイブです。スコア、要約、詳細レビューを見比べると、改善の優先順位を掴みやすくなります。',
      sections: [
        {
          title: 'スコアの傾向を読む',
          body: '高得点の作品だけでなく、6 点前後のレビューも見ることで、何が一歩足りないのかを具体的に掴めます。',
        },
        {
          title: '要約から本編へ進む',
          body: 'カード要約で気になる作品を見つけたら、本編レビューで長所、弱点、改善提案まで連続して確認できます。',
        },
        {
          title: '自分の作品に置き換える',
          body: '似た被写体や構図の例を探すと、自分の次の撮影や現像で試すべき判断が見えやすくなります。',
        },
      ],
    };
  }

  if (locale === 'en') {
    return {
      title: 'How to use this gallery',
      intro:
        'The public gallery is more than a showcase. It is a compact learning archive for understanding why certain photos scored well, where others fell short, and how written critique connects visual decisions to practical improvement.',
      sections: [
        {
          title: 'Read score patterns',
          body: 'Reviewing both strong and mid-range examples makes it easier to see what consistently improves composition, light, timing, and technical control.',
        },
        {
          title: 'Move from summary to full critique',
          body: 'Each card gives you a fast summary, while the full review explains the strengths, weak points, and next actions in more detail.',
        },
        {
          title: 'Apply ideas to your own shoots',
          body: 'Find images close to your subject or style, then use those critiques as a checklist for your next capture or edit.',
        },
      ],
    };
  }

  return {
    title: '如何利用这个公开长廊',
    intro:
      '这个页面不只是作品展示区，也是一个可复盘的公开案例库。你可以结合分数、摘要和完整评图结果，快速理解哪些照片为什么更好，哪些问题最值得优先修正。',
    sections: [
      {
        title: '观察分数背后的规律',
        body: '不要只看高分作品，6 分上下的样例往往更能说明普通照片与优秀照片之间具体差了什么。',
      },
      {
        title: '从摘要进入完整评图',
        body: '卡片摘要适合快速筛选，点进完整评图后可以连续看到优点、问题和可执行建议。',
      },
      {
        title: '把案例迁移到自己的照片',
        body: '找到和你题材、光线或构图接近的作品，会更容易把这些建议直接转成下一次拍摄或修图动作。',
      },
    ],
  };
}

function scoreTone(score: number): string {
  if (score >= 8) return 'text-sage border-sage/30 bg-sage/10';
  if (score >= 6) return 'text-gold border-gold/30 bg-gold/10';
  return 'text-rust border-rust/30 bg-rust/10';
}

function trimSummary(summary: string, maxLength = 78): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function getAuthorBadge(username: string) {
  const normalized = username.trim();
  return {
    initial: normalized.charAt(0).toUpperCase() || 'P',
    label: normalized || 'PicSpeak',
  };
}

function getPaginationCopy(locale: string) {
  if (locale === 'ja') {
    return {
      page: 'ページ',
      current: (value: number) => `${value} ページ`,
      previous: '前のページ',
      next: '次のページ',
    };
  }
  if (locale === 'en') {
    return {
      page: 'Page',
      current: (value: number) => `Page ${value}`,
      previous: 'Previous',
      next: 'Next',
    };
  }
  return {
    page: '页码',
    current: (value: number) => `第 ${value} 页`,
    previous: '上一页',
    next: '下一页',
  };
}

function GalleryCardImage({
  item,
  alt,
}: {
  item: PublicGalleryItem;
  alt: string;
}) {
  const primarySrc = item.photo_url || item.photo_thumbnail_url || '';
  const fallbackSrc = item.photo_thumbnail_url || '';
  const [src, setSrc] = useState(primarySrc);
  const [broken, setBroken] = useState(!primarySrc);

  useEffect(() => {
    setSrc(primarySrc);
    setBroken(!primarySrc);
  }, [primarySrc]);

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-[radial-gradient(circle_at_top,rgba(239,225,198,0.24),transparent_38%),linear-gradient(180deg,rgba(20,18,16,0.08),rgba(11,10,9,0.26))]">
      {!broken && src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          onError={() => {
            if (fallbackSrc && src !== fallbackSrc) {
              setSrc(fallbackSrc);
              return;
            }
            setBroken(true);
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,rgba(33,30,26,0.92),rgba(17,15,13,0.96))] px-6 text-center text-sm leading-6 text-ink-subtle">
          {alt}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[rgba(11,10,9,0.92)] via-[rgba(11,10,9,0.08)] to-transparent" />
    </div>
  );
}

export default function GalleryPage() {
  const { t, locale } = useI18n();
  const seoCopy = useMemo(() => getGallerySeoCopy(locale), [locale]);
  const { token, userInfo, ensureToken, isLoading: authLoading } = useAuth();
  const [pages, setPages] = useState<PublicGalleryItem[][]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [likeBusyId, setLikeBusyId] = useState<string | null>(null);
  const [guestLikePromptOpen, setGuestLikePromptOpen] = useState(false);

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  const paginationCopy = useMemo(() => getPaginationCopy(locale), [locale]);
  const viewerToken = userInfo?.plan && userInfo.plan !== 'guest' ? token ?? undefined : undefined;

  const loadPage = useCallback(async (cursor?: string | null) => {
    const response = await getPublicGallery({ cursor: cursor ?? undefined, limit: PAGE_SIZE }, viewerToken);
    return {
      items: response.items,
      totalCount: response.total_count,
      nextCursor: response.next_cursor,
    };
  }, [viewerToken]);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');
    setActionError('');
    setPages([]);
    setPageIndex(0);
    setTotalCount(0);
    setNextCursor(null);

    loadPage()
      .then((data) => {
        if (cancelled) return;
        setPages([data.items]);
        setTotalCount(data.totalCount);
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadPage, t]);

  useEffect(() => {
    if (!guestLikePromptOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGuestLikePromptOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [guestLikePromptOpen]);

  const handlePrevPage = () => {
    if (pageIndex === 0 || paging) return;
    setPageIndex((current) => current - 1);
  };

  const patchGalleryItem = useCallback((reviewId: string, updater: (item: PublicGalleryItem) => PublicGalleryItem) => {
    setPages((current) =>
      current.map((page) =>
        page.map((item) => (item.review_id === reviewId ? updater(item) : item))
      )
    );
  }, []);

  const handleNextPage = async () => {
    if (paging) return;

    if (pageIndex < pages.length - 1) {
      setPageIndex((current) => current + 1);
      return;
    }

    if (!nextCursor) return;

    setPaging(true);
    try {
      const data = await loadPage(nextCursor);
      setPages((current) => [...current, data.items]);
      setTotalCount(data.totalCount);
      setNextCursor(data.nextCursor);
      setPageIndex((current) => current + 1);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setPaging(false);
    }
  };

  const handleLikeToggle = useCallback(
    async (item: PublicGalleryItem) => {
      if (likeBusyId || authLoading) return;

      setActionError('');
      if (!userInfo || userInfo.plan === 'guest') {
        setGuestLikePromptOpen(true);
        return;
      }

      setLikeBusyId(item.review_id);
      try {
        const authToken = await ensureToken();
        const payload = item.liked_by_viewer
          ? await unlikeGalleryReview(item.review_id, authToken)
          : await likeGalleryReview(item.review_id, authToken);

        patchGalleryItem(item.review_id, (current) => ({
          ...current,
          like_count: payload.like_count,
          liked_by_viewer: payload.liked_by_viewer,
        }));
      } catch (err) {
        setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
      } finally {
        setLikeBusyId(null);
      }
    },
    [authLoading, ensureToken, likeBusyId, patchGalleryItem, t, userInfo]
  );

  const items = pages[pageIndex] ?? [];
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = pageIndex < pages.length - 1 || nextCursor !== null;

  return (
    <div className="min-h-screen pt-14">
      {guestLikePromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setGuestLikePromptOpen(false)}
        >
          <div className="absolute inset-0 bg-[#050505]/96" />
          <div
            className="relative w-full max-w-md overflow-hidden rounded-[24px] border border-[#2b2722] bg-[#11100e] p-6 shadow-[0_32px_96px_rgba(0,0,0,0.72)] animate-fade-in"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-like-signin-title"
          >
            <button
              type="button"
              onClick={() => setGuestLikePromptOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border-subtle p-2 text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
              aria-label={t('gallery_like_signin_cancel')}
            >
              <X size={14} />
            </button>

            <div className="mb-6">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/80">
                <Heart size={12} />
                {t('gallery_like')}
              </p>
              <h2 id="gallery-like-signin-title" className="font-display text-3xl text-ink">
                {t('gallery_like_signin_title')}
              </h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{t('gallery_like_signin_body')}</p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGuestLikePromptOpen(false)}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
              >
                {t('gallery_like_signin_cancel')}
              </button>
              <ClerkSignInTrigger
                className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                fallbackRedirectUrl="/gallery"
                signedInClassName="hidden"
              >
                {t('gallery_like_signin_cta')}
              </ClerkSignInTrigger>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-7xl px-6 py-12 animate-fade-in">
        <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.16),transparent_36%),rgba(18,16,13,0.78)] px-6 py-8 sm:px-8 sm:py-10">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.28em] text-gold/80">
                <LayoutGrid size={12} />
                {t('gallery_label')}
              </p>
              <h1 className="font-display text-4xl text-ink sm:text-5xl">{t('gallery_headline')}</h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{t('gallery_intro')}</p>
            </div>

            <div className="rounded-2xl border border-border-subtle bg-void/55 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_count_label')}</p>
              <p className="mt-2 font-display text-4xl text-gold">{totalCount}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {actionError && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {actionError}
          </div>
        )}

        {loading ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={index}
                className="h-[420px] animate-pulse rounded-[24px] border border-border-subtle bg-raised/45"
              />
            ))}
          </section>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-[24px] border border-border-subtle bg-raised/55 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/20 bg-gold/10 text-gold">
              <Star size={20} />
            </div>
            <h2 className="mt-5 font-display text-3xl text-ink">{t('gallery_empty')}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-muted">{t('gallery_empty_body')}</p>
            <Link
              href="/workspace"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
            >
              {t('gallery_empty_cta')}
              <ChevronRight size={14} />
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => {
                const author = getAuthorBadge(item.owner_username);

                return (
                  <article
                    key={item.review_id}
                    className="group overflow-hidden rounded-[24px] border border-border-subtle bg-raised/60 transition-all duration-300 hover:-translate-y-1 hover:border-gold/30"
                  >
                    <div className="relative overflow-hidden">
                      <GalleryCardImage item={item} alt={t('photo_thumbnail_alt')} />

                      <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.22)] backdrop-blur-sm ${scoreTone(item.final_score)}`}
                        >
                          {item.final_score.toFixed(1)}
                        </span>
                        <span className="rounded-full border border-border-subtle bg-void/80 px-2.5 py-1 text-[11px] uppercase tracking-[0.16em] text-ink-subtle">
                          {item.mode}
                        </span>
                      </div>

                      <div className="absolute bottom-3 right-3 flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(241,237,230,0.88)] px-2.5 py-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.18)]">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(224,186,136,0.95),rgba(138,110,67,0.95))] text-[11px] font-semibold text-void">
                          {author.initial}
                        </span>
                        <span className="max-w-[96px] truncate text-xs text-void">{author.label}</span>
                      </div>
                    </div>

                    <div className="space-y-3 px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-ink-subtle">{t('gallery_saved_at')}</p>
                      <p className="text-sm text-ink">
                        {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </p>
                      <p
                        className="text-xs leading-6 text-ink-muted"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {trimSummary(item.summary || t('gallery_summary_fallback'))}
                      </p>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleLikeToggle(item)}
                          disabled={likeBusyId === item.review_id}
                          className={`inline-flex min-w-[88px] items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition-colors disabled:opacity-60 ${
                            item.liked_by_viewer
                              ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                              : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
                          }`}
                          aria-pressed={item.liked_by_viewer}
                          aria-label={item.liked_by_viewer ? t('gallery_unlike') : t('gallery_like')}
                        >
                          <Heart size={14} className={item.liked_by_viewer ? 'fill-current' : ''} />
                          <span>{item.like_count}</span>
                        </button>

                        <Link
                          href={`/reviews/${item.review_id}?back=/gallery`}
                          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-gold/30 px-3 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
                        >
                          {t('gallery_open_review')}
                          <ChevronRight size={14} />
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <div className="mt-8 flex flex-col items-center gap-3">
              <p className="text-xs uppercase tracking-[0.18em] text-ink-subtle">
                {paginationCopy.page} - {paginationCopy.current(pageIndex + 1)}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevPage}
                  disabled={!hasPrevPage || paging}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  {paginationCopy.previous}
                </button>
                <button
                  type="button"
                  onClick={handleNextPage}
                  disabled={!hasNextPage || paging}
                  className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
                >
                  {paging ? t('reviews_loading_more') : paginationCopy.next}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </>
        )}

        <section className="mt-16 rounded-[28px] border border-border-subtle bg-raised/35 px-6 py-8 sm:px-8">
          <div className="max-w-4xl">
            <h2 className="font-display text-3xl text-ink sm:text-4xl">{seoCopy.title}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">{seoCopy.intro}</p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {seoCopy.sections.map((section) => (
              <article
                key={section.title}
                className="rounded-[22px] border border-border-subtle bg-void/35 p-5"
              >
                <h3 className="font-display text-2xl text-ink">{section.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{section.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
