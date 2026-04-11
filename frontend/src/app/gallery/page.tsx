'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronRight, Info, LayoutGrid, Star, X, Heart } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { getPublicGallery, likeGalleryReview, unlikeGalleryReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildGalleryRestoreKey, readGalleryRestoreState, saveGalleryRestoreState } from '@/lib/gallery-navigation';
import { useI18n } from '@/lib/i18n';
import { PublicGalleryItem, PublicGalleryQuery } from '@/lib/types';

// Extracted sub-components
import GalleryFilters, { FilterDraft } from '@/components/gallery/GalleryFilters';
import GalleryPagination from '@/components/gallery/GalleryPagination';
import GalleryCard from '@/components/gallery/GalleryCard';

const PAGE_SIZE = 12;

const EMPTY_FILTERS: FilterDraft = {
  createdFrom: '',
  createdTo: '',
  minScore: '',
  maxScore: '',
  imageType: '',
};

function displayDateToIso(value: string): string | null {
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function isoDateToDisplay(value: string): string {
  return value.replace(/-/g, '/');
}

function isInvalidCompletedDate(value: string): boolean {
  if (!value) return false;
  if (value.length < 10) return false;
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return true;
  const [, year, month, day] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00`);
  return (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  );
}

function galleryFiltersFromSearchParams(searchParams: URLSearchParams): FilterDraft {
  return {
    createdFrom: searchParams.get('created_from') ? isoDateToDisplay(searchParams.get('created_from') as string) : '',
    createdTo: searchParams.get('created_to') ? isoDateToDisplay(searchParams.get('created_to') as string) : '',
    minScore: searchParams.get('min_score') ?? '',
    maxScore: searchParams.get('max_score') ?? '',
    imageType: (searchParams.get('image_type') as any) ?? '',
  };
}

function buildGallerySearchParams(filters: FilterDraft, options?: { restore?: boolean }): URLSearchParams {
  const params = new URLSearchParams();
  const createdFromIso = displayDateToIso(filters.createdFrom);
  const createdToIso = displayDateToIso(filters.createdTo);

  if (createdFromIso) params.set('created_from', createdFromIso);
  if (createdToIso) params.set('created_to', createdToIso);
  if (filters.minScore !== '') params.set('min_score', filters.minScore);
  if (filters.maxScore !== '') params.set('max_score', filters.maxScore);
  if (filters.imageType) params.set('image_type', filters.imageType);
  if (options?.restore) params.set('restore', '1');

  return params;
}

function toGalleryQuery(filters: FilterDraft): PublicGalleryQuery {
  const query: PublicGalleryQuery = { limit: PAGE_SIZE };
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
    query.image_type = filters.imageType as any;
  }

  return query;
}

function GalleryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { token, userInfo, ensureToken, isLoading: authLoading } = useAuth();
  
  const pendingRestoreRef = useRef<any>(null);
  const pagesRef = useRef<PublicGalleryItem[][]>([]);
  const nextCursorRef = useRef<string | null>(null);
  
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
  const viewerToken = userInfo?.plan && userInfo.plan !== 'guest' ? token ?? undefined : undefined;
  const currentPlan = (userInfo?.plan ?? 'guest') as 'guest' | 'free' | 'pro';

  const searchParamsKey = searchParams.toString();
  const filterSearch = useMemo(() => {
    const next = new URLSearchParams(searchParamsKey);
    next.delete('restore');
    return next;
  }, [searchParamsKey]);
  const shouldRestore = searchParams.get('restore') === '1';
  const filterSignature = filterSearch.toString();
  const appliedFilters = useMemo(() => galleryFiltersFromSearchParams(filterSearch), [filterSearch]);
  const restoreKey = useMemo(() => buildGalleryRestoreKey(filterSignature), [filterSignature]);
  
  const backHref = useMemo(() => {
    const params = buildGallerySearchParams(appliedFilters, { restore: true });
    const query = params.toString();
    return query ? `/gallery?${query}` : '/gallery';
  }, [appliedFilters]);

  const [draftFilters, setDraftFilters] = useState<FilterDraft>(appliedFilters);
  const createdFromInvalid = isInvalidCompletedDate(draftFilters.createdFrom);
  const createdToInvalid = isInvalidCompletedDate(draftFilters.createdTo);
  const hasInvalidDate = createdFromInvalid || createdToInvalid;

  useEffect(() => {
    setDraftFilters(appliedFilters);
  }, [appliedFilters]);

  useEffect(() => {
    pagesRef.current = pages;
    nextCursorRef.current = nextCursor;
  }, [nextCursor, pages]);

  const persistGalleryState = useCallback((reviewId: string | null = null) => {
    if (pages.length === 0) return;
    const normalizedPageIndex = Math.min(Math.max(0, pageIndex), pages.length - 1);
    saveGalleryRestoreState(restoreKey, {
      pages,
      totalCount,
      nextCursor,
      pageIndex: normalizedPageIndex,
      scrollY: window.scrollY,
      reviewId,
    });
  }, [nextCursor, pageIndex, pages, restoreKey, totalCount]);

  const loadPage = useCallback(async (cursor?: string | null) => {
    const response = await getPublicGallery({ ...toGalleryQuery(appliedFilters), cursor: cursor ?? undefined }, viewerToken);
    return {
      items: response.items,
      totalCount: response.total_count,
      nextCursor: response.next_cursor,
    };
  }, [appliedFilters, viewerToken]);

  useEffect(() => {
    let cancelled = false;
    setError('');
    setActionError('');
    pendingRestoreRef.current = null;

    const restoredState = shouldRestore ? readGalleryRestoreState(restoreKey) : null;
    if (restoredState) {
      pendingRestoreRef.current = restoredState;
      setPages(restoredState.pages);
      setTotalCount(restoredState.totalCount);
      setNextCursor(restoredState.nextCursor);
      setPageIndex(restoredState.pageIndex);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
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
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [loadPage, restoreKey, shouldRestore, t]);

  useEffect(() => {
    const restoreState = pendingRestoreRef.current;
    if (loading || !restoreState) return;

    let timeoutId = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          window.scrollTo({ top: restoreState.scrollY, behavior: 'auto' });
          if (restoreState.reviewId) {
            const targetCard = document.querySelector<HTMLElement>(`[data-review-id="${restoreState.reviewId}"]`);
            if (targetCard) {
              const rect = targetCard.getBoundingClientRect();
              if (!(rect.top >= 96 && rect.bottom <= window.innerHeight - 24)) {
                targetCard.scrollIntoView({ block: 'center', behavior: 'auto' });
              }
            }
          }
          pendingRestoreRef.current = null;
        });
      });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [loading, pageIndex, pages]);

  useEffect(() => {
    if (loading || pages.length === 0) return;
    persistGalleryState();
  }, [loading, pages, pageIndex, totalCount, nextCursor, persistGalleryState]);

  useEffect(() => {
    if (loading || pages.length === 0) return;
    let frameId = 0;
    const handlePersist = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => persistGalleryState());
    };
    window.addEventListener('scroll', handlePersist, { passive: true });
    window.addEventListener('pagehide', handlePersist);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('scroll', handlePersist);
      window.removeEventListener('pagehide', handlePersist);
    };
  }, [loading, pages.length, persistGalleryState]);

  const pushFilterState = useCallback((filters: FilterDraft) => {
    const params = buildGallerySearchParams(filters);
    const query = params.toString();
    router.push(query ? `/gallery?${query}` : '/gallery');
  }, [router]);

  const patchGalleryItem = useCallback((reviewId: string, updater: (item: PublicGalleryItem) => PublicGalleryItem) => {
    setPages((current) =>
      current.map((page) =>
        page.map((item) => (item.review_id === reviewId ? updater(item) : item))
      )
    );
  }, []);

  const totalPages = Math.max(1, Math.ceil(Math.max(totalCount, 1) / PAGE_SIZE));

  const goToPage = useCallback(async (targetIndex: number) => {
    if (paging) return;
    const normalizedTarget = Math.min(Math.max(targetIndex, 0), totalPages - 1);
    if (normalizedTarget === pageIndex) return;

    const currentPages = pagesRef.current;
    if (normalizedTarget < currentPages.length) {
      setPageIndex(normalizedTarget);
      return;
    }

    let cursor = nextCursorRef.current;
    if (!cursor) {
      setPageIndex(Math.max(0, currentPages.length - 1));
      return;
    }

    setPaging(true);
    setError('');
    try {
      let loadedPages = currentPages.slice();
      let loadedTotalCount = totalCount;
      while (loadedPages.length <= normalizedTarget && cursor) {
        const data = await loadPage(cursor);
        loadedPages = [...loadedPages, data.items];
        loadedTotalCount = data.totalCount;
        cursor = data.nextCursor;
      }
      setPages(loadedPages);
      setTotalCount(loadedTotalCount);
      setNextCursor(cursor);
      setPageIndex(Math.min(normalizedTarget, loadedPages.length - 1));
    } catch (err) {
      setError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setPaging(false);
    }
  }, [loadPage, pageIndex, paging, t, totalCount, totalPages]);

  const handlePrevPage = () => {
    if (pageIndex === 0 || paging) return;
    setPageIndex((current) => current - 1);
  };

  const handleNextPage = async () => {
    await goToPage(pageIndex + 1);
  };

  const handleApplyFilters = () => {
    if (hasInvalidDate) return;
    pushFilterState(draftFilters);
  };

  const handleResetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    pushFilterState(EMPTY_FILTERS);
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
  const visibleStart = items.length > 0 ? pageIndex * PAGE_SIZE + 1 : 0;
  const visibleEnd = items.length > 0 ? visibleStart + items.length - 1 : 0;

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
          >
            <button
              type="button"
              onClick={() => setGuestLikePromptOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border-subtle p-2 text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
            >
              <X size={14} />
            </button>
            <div className="mb-6">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/80">
                <Heart size={12} />
                {t('gallery_like')}
              </p>
              <h2 className="font-display text-3xl text-ink">{t('gallery_like_signin_title')}</h2>
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
              <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/10 px-4 py-3 text-sm leading-7 text-ink-muted">
                <p className="inline-flex items-center gap-2 font-medium text-gold">
                  <Info size={14} />
                  {t('gallery_score_upgrade_badge')}
                </p>
                <p className="mt-2">{t('gallery_score_upgrade_body')}</p>
                <p className="mt-1 text-ink-subtle">{t('gallery_score_upgrade_detail')}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-void/55 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_count_label')}</p>
              <p className="mt-2 font-display text-4xl text-gold">{totalCount}</p>
            </div>
          </div>
        </section>

        <GalleryFilters
          draftFilters={draftFilters}
          setDraftFilters={setDraftFilters}
          onApply={handleApplyFilters}
          onReset={handleResetFilters}
          hasInvalidDate={hasInvalidDate}
          createdFromInvalid={createdFromInvalid}
          createdToInvalid={createdToInvalid}
        />

        {(error || actionError) && (
          <div className="mt-6 flex items-center gap-2 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust animate-fade-in">
            <AlertCircle size={14} />
            {error || actionError}
          </div>
        )}

        {loading ? (
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div key={index} className="h-[420px] animate-pulse rounded-[24px] border border-border-subtle bg-raised/45" />
            ))}
          </section>
        ) : items.length === 0 ? (
          <section className="mt-8 rounded-[24px] border border-border-subtle bg-raised/55 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/20 bg-gold/10 text-gold">
              <Star size={20} />
            </div>
            <h2 className="mt-5 font-display text-3xl text-ink">{t('gallery_empty')}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-muted">{t('gallery_empty_body')}</p>
            <Link href="/workspace" className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10">
              {t('gallery_empty_cta')}
              <ChevronRight size={14} />
            </Link>
          </section>
        ) : (
          <>
            <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item, idx) => (
                <GalleryCard
                  key={item.review_id}
                  item={item}
                  index={idx}
                  likeBusyId={likeBusyId}
                  handleLikeToggle={handleLikeToggle}
                  persistGalleryState={persistGalleryState}
                  backHref={backHref}
                  dateLocale={dateLocale}
                />
              ))}
            </section>

            <GalleryPagination
              pageIndex={pageIndex}
              totalPages={totalPages}
              totalCount={totalCount}
              visibleStart={visibleStart}
              visibleEnd={visibleEnd}
              paging={paging}
              goToPage={goToPage}
              handlePrevPage={handlePrevPage}
              handleNextPage={handleNextPage}
            />
          </>
        )}

        <section className="mt-16 rounded-[28px] border border-border-subtle bg-raised/35 px-6 py-8 sm:px-8">
          <div className="max-w-4xl">
            <h2 className="font-display text-3xl text-ink sm:text-4xl">{t('gallery_seo_title')}</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted">{t('gallery_seo_intro')}</p>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <article key={i} className="rounded-[22px] border border-border-subtle bg-void/35 p-5 transition-all duration-300 hover:border-gold/20">
                <h3 className="font-display text-2xl text-ink">{t(`gallery_seo_section${i}_title` as any)}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{t(`gallery_seo_section${i}_body` as any)}</p>
              </article>
            ))}
          </div>
        </section>
        
        <ProPromoCard plan={currentPlan} scene="gallery" fallbackRedirectUrl="/gallery" className="mt-12" />
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<div className="min-h-screen pt-14 px-6 py-12 mx-auto max-w-7xl"><div className="h-40 animate-pulse rounded-[28px] border border-border-subtle bg-void/40" /></div>}>
      <GalleryPageContent />
    </Suspense>
  );
}
