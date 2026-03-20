'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronLeft, ChevronRight, LayoutGrid, Star } from 'lucide-react';
import { getPublicGallery } from '@/lib/api';
import { formatUserFacingError } from '@/lib/error-utils';
import { useI18n } from '@/lib/i18n';
import { PublicGalleryItem } from '@/lib/types';

const PAGE_SIZE = 12;

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
  const [pages, setPages] = useState<PublicGalleryItem[][]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState('');

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
  const paginationCopy = useMemo(() => getPaginationCopy(locale), [locale]);

  const loadPage = useCallback(async (cursor?: string | null) => {
    const response = await getPublicGallery({ cursor: cursor ?? undefined, limit: PAGE_SIZE });
    return {
      items: response.items,
      nextCursor: response.next_cursor,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError('');
    setPages([]);
    setPageIndex(0);
    setNextCursor(null);

    loadPage()
      .then((data) => {
        if (cancelled) return;
        setPages([data.items]);
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

  const handlePrevPage = () => {
    if (pageIndex === 0 || paging) return;
    setPageIndex((current) => current - 1);
  };

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
      setNextCursor(data.nextCursor);
      setPageIndex((current) => current + 1);
    } catch (err) {
      setError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setPaging(false);
    }
  };

  const items = pages[pageIndex] ?? [];
  const loadedCount = useMemo(() => pages.reduce((sum, page) => sum + page.length, 0), [pages]);
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = pageIndex < pages.length - 1 || nextCursor !== null;

  return (
    <div className="min-h-screen pt-14">
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
              <p className="mt-2 font-display text-4xl text-gold">{loadedCount}</p>
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {error}
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

                      <Link
                        href={`/reviews/${item.review_id}?back=/gallery`}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-gold/30 px-3 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
                      >
                        {t('gallery_open_review')}
                        <ChevronRight size={14} />
                      </Link>
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
      </div>
    </div>
  );
}
