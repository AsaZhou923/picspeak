'use client';
/* eslint-disable @next/next/no-img-element -- Gallery cards use the raw thumbnail URL directly; native img is the most reliable renderer here. */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarDays, ChevronLeft, ChevronRight, Heart, Info, LayoutGrid, RefreshCw, SlidersHorizontal, Star, X, Zap } from 'lucide-react';
import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { getPublicGallery, likeGalleryReview, unlikeGalleryReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildGalleryRestoreKey, GalleryRestoreState, readGalleryRestoreState, saveGalleryRestoreState } from '@/lib/gallery-navigation';
import { useI18n } from '@/lib/i18n';
import { ImageType, PublicGalleryItem, PublicGalleryQuery } from '@/lib/types';

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

function getModeBadgeConfig(mode: PublicGalleryItem['mode']) {
  if (mode === 'pro') {
    return {
      label: 'Pro',
      icon: Star,
      className:
        'border-gold/35 bg-[linear-gradient(135deg,rgba(200,162,104,0.24),rgba(58,40,18,0.78))] text-gold shadow-[0_10px_30px_rgba(200,162,104,0.18)]',
      iconClassName: 'text-gold/90',
    };
  }

  return {
    label: 'Flash',
    icon: Zap,
    className:
      'border-white/12 bg-[linear-gradient(135deg,rgba(241,237,230,0.14),rgba(22,22,24,0.78))] text-white/72 shadow-[0_10px_30px_rgba(0,0,0,0.18)]',
    iconClassName: 'text-white/60',
  };
}

function getPaginationCopy(locale: string) {
  if (locale === 'ja') {
    return {
      page: 'ページ',
      current: (value: number) => `${value} ページ`,
      total: (value: number) => `全 ${value} ページ`,
      showing: (from: number, to: number, total: number) =>
        total <= 0 ? '表示できる作品はまだありません' : `${from}-${to} 件目 / 全 ${total} 件`,
      first: '最初',
      last: '最後',
      previous: '前のページ',
      next: '次のページ',
    };
  }
  if (locale === 'en') {
    return {
      page: 'Page',
      current: (value: number) => `Page ${value}`,
      total: (value: number) => `${value} pages total`,
      showing: (from: number, to: number, total: number) =>
        total <= 0 ? 'No works available yet' : `Showing ${from}-${to} of ${total}`,
      first: 'First',
      last: 'Last',
      previous: 'Previous',
      next: 'Next',
    };
  }
  return {
    page: '页码',
    current: (value: number) => `第 ${value} 页`,
    total: (value: number) => `共 ${value} 页`,
    showing: (from: number, to: number, total: number) =>
      total <= 0 ? '暂时还没有可显示的作品' : `当前显示 ${from}-${to} / 共 ${total} 项`,
    first: '第一页',
    last: '最后页',
    previous: '上一页',
    next: '下一页',
  };
}

function buildPaginationSlots(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const slots = new Set<number>([0, totalPages - 1, currentPage, currentPage - 1, currentPage + 1]);
  if (currentPage <= 2) {
    slots.add(1);
    slots.add(2);
    slots.add(3);
  }
  if (currentPage >= totalPages - 3) {
    slots.add(totalPages - 2);
    slots.add(totalPages - 3);
    slots.add(totalPages - 4);
  }

  const ordered = Array.from(slots).filter((value) => value >= 0 && value < totalPages).sort((a, b) => a - b);
  const result: Array<number | 'ellipsis'> = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const page = ordered[index];
    const previous = ordered[index - 1];
    if (index > 0 && previous !== undefined && page - previous > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }
  return result;
}

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

function getGalleryFilterCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      filtersLabel: 'フィルター',
      from: '開始日',
      to: '終了日',
      minScore: '最低スコア',
      maxScore: '最高スコア',
      imageType: '写真タイプ',
      allTypes: 'すべて',
      apply: '適用',
      reset: 'リセット',
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
  };
}

function galleryFiltersFromSearchParams(searchParams: URLSearchParams): FilterDraft {
  return {
    createdFrom: searchParams.get('created_from') ? isoDateToDisplay(searchParams.get('created_from') as string) : '',
    createdTo: searchParams.get('created_to') ? isoDateToDisplay(searchParams.get('created_to') as string) : '',
    minScore: searchParams.get('min_score') ?? '',
    maxScore: searchParams.get('max_score') ?? '',
    imageType: (searchParams.get('image_type') as '' | ImageType | null) ?? '',
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
    query.image_type = filters.imageType;
  }

  return query;
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

function GalleryCardImage({
  item,
  alt,
}: {
  item: PublicGalleryItem;
  alt: string;
}) {
  const primarySrc = item.photo_thumbnail_url || '';
  const [src, setSrc] = useState(primarySrc);
  const [broken, setBroken] = useState(!primarySrc);

  useEffect(() => {
    setSrc(primarySrc);
    setBroken(!primarySrc);
  }, [primarySrc]);

  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] border border-border-subtle bg-[radial-gradient(circle_at_top,rgba(200,162,104,0.14),transparent_40%),linear-gradient(180deg,rgba(248,244,237,0.92),rgba(228,221,211,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-[rgba(208,186,146,0.14)] dark:bg-[radial-gradient(circle_at_top,rgba(239,225,198,0.24),transparent_38%),linear-gradient(180deg,rgba(20,18,16,0.08),rgba(11,10,9,0.26))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {!broken && src ? (
        <>
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-[26px] saturate-[0.85] transition-transform duration-700 group-hover:scale-[1.14] dark:opacity-45"
          />
          <div className="absolute inset-x-4 top-4 bottom-6 flex items-center justify-center overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.54),rgba(244,238,229,0.24))] shadow-[0_18px_44px_rgba(120,96,68,0.14)] backdrop-blur-[3px] dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] dark:shadow-[0_20px_54px_rgba(0,0,0,0.34)]">
            <img
              src={src}
              alt={alt}
              loading="lazy"
              decoding="async"
              sizes="(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
              className="h-full w-full object-contain px-3 py-4 transition-transform duration-700 group-hover:scale-[1.02]"
              onError={() => setBroken(true)}
            />
          </div>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,rgba(244,239,231,0.96),rgba(227,219,208,0.94))] px-6 text-center text-sm leading-6 text-ink-subtle dark:bg-[linear-gradient(145deg,rgba(33,30,26,0.92),rgba(17,15,13,0.96))]">
          {alt}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.32),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)_56%,rgba(250,248,244,0.86))] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%),linear-gradient(180deg,rgba(12,11,10,0.04),rgba(12,11,10,0.16)_55%,rgba(12,11,10,0.88))]" />
    </div>
  );
}

function GalleryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const seoCopy = useMemo(() => getGallerySeoCopy(locale), [locale]);
  const { token, userInfo, ensureToken, isLoading: authLoading } = useAuth();
  const pendingRestoreRef = useRef<GalleryRestoreState | null>(null);
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
  const paginationCopy = useMemo(() => getPaginationCopy(locale), [locale]);
  const filterCopy = useMemo(() => getGalleryFilterCopy(locale), [locale]);
  const viewerToken = userInfo?.plan && userInfo.plan !== 'guest' ? token ?? undefined : undefined;
  const currentPlan = (userInfo?.plan ?? 'guest') as 'guest' | 'free' | 'pro';
  const invalidDateCopy =
    locale === 'ja'
      ? '有効な日付を yyyy/mm/dd 形式で入力してください'
      : locale === 'en'
        ? 'Enter a valid date in yyyy/mm/dd format'
        : '请输入有效日期，格式为 yyyy/mm/dd';
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
      return () => {
        cancelled = true;
      };
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
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadPage, restoreKey, shouldRestore, t]);

  useEffect(() => {
    const restoreState = pendingRestoreRef.current;
    if (loading || !restoreState) return;

    let timeoutId = 0;
    let frameA = 0;
    let frameB = 0;

    timeoutId = window.setTimeout(() => {
      frameA = window.requestAnimationFrame(() => {
        frameB = window.requestAnimationFrame(() => {
          window.scrollTo({ top: restoreState.scrollY, behavior: 'auto' });

          if (restoreState.reviewId) {
            const targetCard = document.querySelector<HTMLElement>(`[data-review-id="${restoreState.reviewId}"]`);
            if (targetCard) {
              const rect = targetCard.getBoundingClientRect();
              const isReasonablePosition = rect.top >= 96 && rect.bottom <= window.innerHeight - 24;
              if (!isReasonablePosition) {
                targetCard.scrollIntoView({ block: 'center', behavior: 'auto' });
              }
            }
          }

          pendingRestoreRef.current = null;
        });
      });
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
      window.cancelAnimationFrame(frameA);
      window.cancelAnimationFrame(frameB);
    };
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
  const hasPrevPage = pageIndex > 0;
  const hasNextPage = pageIndex < pages.length - 1 || nextCursor !== null;
  const paginationSlots = useMemo(() => buildPaginationSlots(pageIndex, totalPages), [pageIndex, totalPages]);

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

        <section className="mt-6 rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_35%),rgba(18,16,13,0.72)] p-5">
          <div className="mb-4 flex items-center gap-2 text-sm text-ink">
            <SlidersHorizontal size={15} className="text-gold" />
            <span>{filterCopy.filtersLabel}</span>
          </div>

          <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
            <DateFilterField
              label={filterCopy.from}
              value={draftFilters.createdFrom}
              error={createdFromInvalid ? invalidDateCopy : undefined}
              onChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, createdFrom: value }))
              }
            />

            <DateFilterField
              label={filterCopy.to}
              value={draftFilters.createdTo}
              error={createdToInvalid ? invalidDateCopy : undefined}
              onChange={(value) =>
                setDraftFilters((prev) => ({ ...prev, createdTo: value }))
              }
            />

            <label className="min-w-0 space-y-2 text-xs text-ink-muted">
              <span>{filterCopy.minScore}</span>
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
              <span>{filterCopy.maxScore}</span>
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
              <span>{filterCopy.imageType}</span>
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
                <option value="">{filterCopy.allTypes}</option>
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
              {filterCopy.apply}
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
            >
              {filterCopy.reset}
            </button>
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
                const modeBadge = getModeBadgeConfig(item.mode);
                const ModeIcon = modeBadge.icon;

                return (
                  <article
                    key={item.review_id}
                    data-review-id={item.review_id}
                    className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-border-subtle bg-[linear-gradient(180deg,rgba(248,244,238,0.96),rgba(236,230,221,0.98))] shadow-[0_18px_48px_rgba(146,120,88,0.12)] transition-all duration-300 hover:-translate-y-1 hover:border-gold/20 hover:shadow-[0_24px_64px_rgba(146,120,88,0.18)] dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(31,28,24,0.94),rgba(18,17,15,0.98))] dark:shadow-[0_18px_48px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_28px_72px_rgba(0,0,0,0.28)]"
                  >
                    <div className="relative overflow-hidden px-3 pt-3">
                      <GalleryCardImage item={item} alt={t('photo_thumbnail_alt')} />

                      <div className="absolute inset-x-6 top-6 flex items-start justify-between gap-2">
                        <div className="flex flex-col items-start gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.22)] backdrop-blur-md ${scoreTone(item.final_score)}`}
                          >
                            {item.final_score.toFixed(1)}
                          </span>
                          {item.recommended && (
                            <span className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-gold shadow-[0_10px_26px_rgba(200,162,104,0.14)]">
                              {t('gallery_recommended')}
                            </span>
                          )}
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur-md ${modeBadge.className}`}
                        >
                          <ModeIcon size={11} strokeWidth={1.8} className={modeBadge.iconClassName} />
                          {modeBadge.label}
                        </span>
                      </div>

                      <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-full border border-border bg-[rgba(250,248,244,0.92)] px-2.5 py-1.5 shadow-[0_12px_30px_rgba(120,96,68,0.14)] backdrop-blur-md dark:border-white/10 dark:bg-[rgba(241,237,230,0.9)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.2)]">
                        {item.owner_avatar_url ? (
                          <img
                            src={item.owner_avatar_url}
                            alt={author.label}
                            loading="lazy"
                            decoding="async"
                            className="h-7 w-7 rounded-full border border-white/45 object-cover"
                          />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(224,186,136,0.95),rgba(138,110,67,0.95))] text-[11px] font-semibold text-white dark:text-void">
                            {author.initial}
                          </span>
                        )}
                        <span className="max-w-[96px] truncate text-xs text-ink dark:text-void">{author.label}</span>
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
                      <div className="rounded-[20px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.45),rgba(245,239,231,0.2))] px-3.5 py-3 dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
                        <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_saved_at')}</p>
                        <p className="mt-2 text-sm font-medium text-ink">
                          {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>

                      <div className="mt-3 rounded-[20px] border border-[rgba(200,162,104,0.16)] bg-[linear-gradient(180deg,rgba(200,162,104,0.08),rgba(255,255,255,0.14))] px-3.5 py-3.5 dark:border-[rgba(200,162,104,0.1)] dark:bg-[linear-gradient(180deg,rgba(200,162,104,0.05),rgba(255,255,255,0.02))]">
                        <p
                          className="text-xs leading-6 text-ink-muted"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {trimSummary(item.summary || t('gallery_summary_fallback'))}
                        </p>
                      </div>

                      <div className="mt-auto flex items-center gap-2 pt-4">
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
                          href={`/reviews/${item.review_id}?back=${encodeURIComponent(backHref)}`}
                          onClick={() => persistGalleryState(item.review_id)}
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

            <div className="mt-8 flex flex-col gap-4 rounded-[24px] border border-border-subtle bg-[linear-gradient(180deg,rgba(248,244,238,0.72),rgba(236,230,221,0.92))] px-4 py-4 shadow-[0_14px_34px_rgba(120,96,68,0.08)] sm:flex-row sm:items-center sm:justify-between dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(31,28,24,0.9),rgba(18,17,15,0.96))] dark:shadow-[0_14px_40px_rgba(0,0,0,0.18)]">
              <div className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-sm font-medium text-gold">
                    {paginationCopy.current(pageIndex + 1)}
                  </span>
                  <span className="rounded-full border border-border-subtle bg-void/40 px-3 py-1 text-xs text-ink-muted">
                    {paginationCopy.total(totalPages)}
                  </span>
                </div>
                <p className="text-xs tracking-[0.08em] text-ink-subtle">
                  {paginationCopy.showing(visibleStart, visibleEnd, totalCount)}
                </p>
              </div>
              <div className="flex flex-col items-center gap-3 sm:items-end">
                <div className="flex items-center justify-center gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => void goToPage(0)}
                    disabled={pageIndex === 0 || paging}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    {paginationCopy.first}
                  </button>
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
                  <button
                    type="button"
                    onClick={() => void goToPage(totalPages - 1)}
                    disabled={pageIndex === totalPages - 1 || paging}
                    className="inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10 disabled:opacity-40"
                  >
                    {paginationCopy.last}
                    <ChevronRight size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-end">
                  {paginationSlots.map((slot, index) =>
                    slot === 'ellipsis' ? (
                      <span
                        key={`ellipsis-${index}`}
                        className="inline-flex h-10 min-w-10 items-center justify-center px-2 text-sm text-ink-subtle"
                      >
                        ...
                      </span>
                    ) : (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => void goToPage(slot)}
                        disabled={paging}
                        aria-current={slot === pageIndex ? 'page' : undefined}
                        className={`inline-flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm transition-colors disabled:opacity-40 ${
                          slot === pageIndex
                            ? 'border-gold/35 bg-gold text-void shadow-[0_10px_24px_rgba(200,162,104,0.22)]'
                            : 'border-border bg-void/35 text-ink-muted hover:border-gold/35 hover:text-gold'
                        }`}
                      >
                        {slot + 1}
                      </button>
                    )
                  )}
                </div>
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
        <ProPromoCard
          plan={currentPlan}
          scene="gallery"
          fallbackRedirectUrl="/gallery"
          className="mt-12"
        />

      </div>
    </div>
  );
}

function GalleryPageFallback() {
  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="h-40 animate-pulse rounded-[28px] border border-border-subtle bg-void/40" />
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <Suspense fallback={<GalleryPageFallback />}>
      <GalleryPageContent />
    </Suspense>
  );
}
