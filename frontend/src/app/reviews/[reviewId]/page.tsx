'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, History, RotateCcw, AlertCircle, ThumbsUp, ThumbsDown, AlertTriangle, Lightbulb, Upload, TrendingDown, ZoomIn, X, Copy, Check, Share2, Download, LayoutGrid, BookmarkPlus, BookmarkCheck, Heart } from 'lucide-react';
import { createReviewShare, exportReview, getReview, getUsage, updateReviewMeta } from '@/lib/api';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ReviewScores, UsageResponse } from '@/lib/types';
import { FinalScoreRing } from '@/components/ui/ScoreRing';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { isDemoReviewId } from '@/lib/demo-review';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { getUploadedPhotoPreviewSrc, refreshUploadedPhotoPreviewSrc } from '@/lib/photo-preview-cache';
import {
  CARD_HIGHLIGHT_DURATION_MS,
  CritiqueImageType,
  DimKey,
  DIM_TO_TAGS,
  FLASH_DETAIL_LIMIT,
  detectSuggestionTags,
  formatExposureValue,
  generateScoreSummary,
  getDimDescByType,
  getDimColorClass,
  getDimTextClass,
  getEffectiveQuota,
  getExportSummaryCopy,
  getFavoriteActionCopy,
  getGalleryActionCopy,
  getImageTypeLabelForLocale,
  getReviewActionCopy,
  getReviewGalleryCardCopy,
  getScoreLabelColor,
  getScoreLabelKey,
  getSuggestionStructureState,
  getWeakestDimKey,
  parsePointWithShortActionTitle,
  parsePointWithTitle,
  parsePoints,
  type TagKey,
} from '@/lib/review-page-copy';

type SectionConfig = {
  accent: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  showTags?: boolean;
  showFeedback?: boolean;
  isPro?: boolean;
  highlightTop?: number;
  highlightedId?: string | null;
};

function CritiqueSection({ accent, borderColor, bgColor, icon, title, body, showTags, showFeedback, isPro = false, highlightTop = 0, highlightedId }: SectionConfig) {
  const { t } = useI18n();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'helpful' | 'vague'>>({});
  const points = parsePoints(body);

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    }).catch(() => {});
  }

  function toggleExpand(index: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleFeedback(index: number, type: 'helpful' | 'vague') {
    setFeedbackGiven((prev) => ({ ...prev, [index]: type }));
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 ${accent}`}>
        <span className="opacity-80">{icon}</span>
        <h3 className="font-display text-xl leading-none">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {points.map((point, i) => {
          const parsed = parsePointWithShortActionTitle(point);
          const tags = showTags ? detectSuggestionTags(parsed.title, parsed.detail) : [];
          const fullText = parsed.title ? `${parsed.title}: ${parsed.detail}` : parsed.detail;
          const isPriority = highlightTop > 0 && i < highlightTop;
          const isExpanded = expandedSet.has(i);
          const detail = parsed.detail;
          const needsTruncation = !isPro && detail.length > FLASH_DETAIL_LIMIT;
          const displayDetail = needsTruncation && !isExpanded
            ? `${detail.slice(0, FLASH_DETAIL_LIMIT)}…`
            : detail;
          const hasTags = showTags && tags.length > 0;
          const cardId = hasTags ? `suggestion-card-${i}` : undefined;
          const tagData = hasTags ? tags.join(' ') : undefined;
          return (
            <div
              key={i}
              id={cardId}
              data-suggestion-tags={tagData}
              className={`group ${bgColor} border-l-2 ${isPriority ? 'border-l-[3px]' : ''} ${borderColor} rounded-r-md px-4 py-3 ${cardId && cardId === highlightedId ? 'animate-card-highlight' : ''}`}
            >
              {isPriority && (
                <div className={`text-[10px] font-semibold ${accent} opacity-60 mb-1.5 tracking-widest uppercase`}>
                  {t('suggestion_priority_badge')}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {parsed.title && (
                    <p className={`text-xs font-semibold ${accent} mb-1.5 opacity-90`}>{parsed.title}</p>
                  )}
                  <p className="text-sm text-ink leading-[1.75]">{displayDetail}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => toggleExpand(i)}
                      className={`mt-1 text-xs ${accent} opacity-60 hover:opacity-100 transition-opacity`}
                    >
                      {isExpanded ? t('suggestion_show_less') : t('suggestion_show_more')}
                    </button>
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold/80 border border-gold/20 font-medium tracking-wide">
                          {t(`tag_${tag}` as Parameters<typeof t>[0])}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(fullText, i)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 mt-0.5 p-1 rounded text-ink-subtle hover:text-ink-muted transition-all"
                  title={t('copy_btn')}
                  aria-label={t('copy_btn')}
                >
                  {copiedIndex === i ? <Check size={12} className="text-sage" /> : <Copy size={12} />}
                </button>
              </div>
              {showFeedback && (
                <div className="mt-2 pt-2 border-t border-border-subtle/40 flex items-center gap-2">
                  {feedbackGiven[i] !== undefined ? (
                    <p className="text-[10px] text-ink-subtle">{t('review_feedback_thanks')}</p>
                  ) : (
                    <>
                      <button
                        onClick={() => handleFeedback(i, 'helpful')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-sage transition-colors"
                      >
                        <ThumbsUp size={9} />{t('review_feedback_helpful')}
                      </button>
                      <span className="text-[10px] text-ink-subtle/30">·</span>
                      <button
                        onClick={() => handleFeedback(i, 'vague')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-rust transition-colors"
                      >
                        <ThumbsDown size={9} />{t('review_feedback_vague')}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const actionCopy = getReviewActionCopy(locale);
  const favoriteCopy = getFavoriteActionCopy(locale);
  const galleryActionCopy = getGalleryActionCopy(locale);
  const reviewGalleryCardCopy = getReviewGalleryCardCopy(locale);
  const exportSummaryCopy = getExportSummaryCopy(locale);

  const reviewId = params.reviewId as string;
  const backHref = searchParams.get('back') ?? '/workspace';
  const isGalleryBackHref = backHref.startsWith('/gallery');
  const favoritesNavLabel = locale === 'ja' ? 'お気に入り' : locale === 'en' ? 'Favorites' : '我的收藏';
  const backLabel =
    isGalleryBackHref
      ? t('nav_gallery')
      : backHref === '/account/reviews'
      ? t('review_back_history')
      : backHref === '/account/favorites'
        ? favoritesNavLabel
        : t('review_back_workspace');
  const { ensureToken, userInfo } = useAuth();

  function handleBackNavigation() {
    if (isGalleryBackHref) {
      if (window.history.length > 1) {
        router.back();
        return;
      }
    }

    router.push(backHref);
  }

  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [photoRecovering, setPhotoRecovering] = useState(false);
  const [photoRecoveryAttempted, setPhotoRecoveryAttempted] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomMounted, setZoomMounted] = useState(false);
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState('');
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [galleryConfirmOpen, setGalleryConfirmOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<'share' | 'export' | 'replay' | 'favorite' | 'gallery' | null>(null);
  const [actionFeedback, setActionFeedback] = useState('');
  const [actionError, setActionError] = useState('');

  const applyResolvedPhotoUrl = useCallback((nextPhotoUrl: string | null) => {
    setPhotoError(false);
    setPhotoRecovering(false);
    setPhotoRecoveryAttempted(false);
    setPhotoUrl(nextPhotoUrl);
  }, []);

  const recoverPhotoUrl = useCallback(async (): Promise<boolean> => {
    if (!review) {
      return false;
    }

    const refreshedLocalPhotoUrl = await refreshUploadedPhotoPreviewSrc(review.photo_id);
    if (refreshedLocalPhotoUrl) {
      applyResolvedPhotoUrl(refreshedLocalPhotoUrl);
      return true;
    }

    try {
      const token = await ensureToken();
      const latestReview = await getReview(review.review_id, token);
      const refreshedRemotePhotoUrl = latestReview.photo_url
        ? `${latestReview.photo_url}${latestReview.photo_url.includes('?') ? '&' : '?'}retry=${Date.now()}`
        : null;

      if (!refreshedRemotePhotoUrl) {
        return false;
      }

      setReview(latestReview);
      applyResolvedPhotoUrl(refreshedRemotePhotoUrl);
      return true;
    } catch (err) {
      console.error('Failed to recover review photo after image error', err);
      return false;
    }
  }, [applyResolvedPhotoUrl, ensureToken, review]);

  const handlePhotoError = useCallback(async () => {
    if (!review || photoRecovering) {
      return;
    }

    if (photoRecoveryAttempted) {
      setPhotoRecovering(false);
      setPhotoError(true);
      return;
    }

    setPhotoRecovering(true);
    setPhotoRecoveryAttempted(true);
    const recovered = await recoverPhotoUrl();
    if (!recovered) {
      setPhotoRecovering(false);
      setPhotoError(true);
    }
  }, [photoRecovering, photoRecoveryAttempted, recoverPhotoUrl, review]);

  const resultImageType = review?.result?.image_type ?? 'default';
  const SCORE_DIMS = [
    { key: 'composition', label: t('score_composition'), desc: getDimDescByType(locale, resultImageType, 'composition') },
    { key: 'lighting',    label: t('score_lighting'),    desc: getDimDescByType(locale, resultImageType, 'lighting') },
    { key: 'color',       label: t('score_color'),       desc: getDimDescByType(locale, resultImageType, 'color') },
    { key: 'impact',      label: t('score_impact'),      desc: getDimDescByType(locale, resultImageType, 'impact') },
    { key: 'technical',   label: t('score_technical'),   desc: getDimDescByType(locale, resultImageType, 'technical') },
  ];

  // Close zoom on Escape key
  useEffect(() => {
    if (!zoomOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomOpen]);

  useEffect(() => {
    if (!galleryConfirmOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGalleryConfirmOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [galleryConfirmOpen]);

  useEffect(() => {
    let cancelled = false;

    ensureToken()
      .then((token) => getReview(reviewId, token))
      .then(async (data) => {
        const localPhotoUrl = await getUploadedPhotoPreviewSrc(data.photo_id);
        if (cancelled) return;
        setReview(data);
        applyResolvedPhotoUrl(localPhotoUrl || data.photo_url || null);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoading(false);
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
      });

    return () => {
      cancelled = true;
    };
  }, [applyResolvedPhotoUrl, reviewId, ensureToken, t]);

  // Fetch usage info for quota-low conversion banner and record failures explicitly.
  useEffect(() => {
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setUsageError('');
      })
      .catch((err) => {
        console.error('Failed to fetch usage on review page', err);
        setUsageError(formatUserFacingError(t, err, t('usage_error')));
      });
  }, [ensureToken, t]);

  // Click a score dimension → scroll to the best matching tagged suggestion.
  // Tries each tag candidate for the dimension in priority order until a card is found.
  // Uses a brief 150 ms delay so the row-highlight (activeDim) is visible before the
  // page scrolls, making the interaction feel intentional rather than abrupt.
  function handleDimClick(dimKey: string) {
    const tags = DIM_TO_TAGS[dimKey];
    if (!tags || tags.length === 0) return;

    for (const tag of tags) {
      const el = document.querySelector<HTMLElement>(`[data-suggestion-tags~="${tag}"]`);
      if (el?.id) {
        // Highlight the dimension row immediately as tactile feedback
        setActiveDim(dimKey);
        // Short pause lets the highlight register before the viewport moves
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedCardId(el.id);
          // Clear the card glow once the animation finishes
          setTimeout(() => setHighlightedCardId(null), CARD_HIGHLIGHT_DURATION_MS);
        }, 150);
        return;
      }
    }
    // No matching suggestion card found in the DOM — don't activate anything
  }

  if (loading) {
    return (
      <div className="pt-14 min-h-screen">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <SkeletonBlock className="h-6 w-32 mb-8" />
          <div className="grid lg:grid-cols-[45%_1fr] gap-8">
            <SkeletonBlock className="h-[500px] w-full rounded-lg" />
            <div className="space-y-4">
              <SkeletonBlock className="h-8 w-48" />
              <SkeletonBlock className="h-28 w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-4 w-4/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <AlertCircle size={40} className="text-rust mx-auto" />
          <p className="text-rust text-sm">{error}</p>
          <button
            onClick={handleBackNavigation}
            className="flex items-center gap-1 text-xs text-ink-subtle hover:text-ink-muted mx-auto"
          >
            <ArrowLeft size={11} /> {t('back_btn')}
          </button>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const r = review.result;
  const isPro = review.mode === 'pro';
  const isDemoReview = isDemoReviewId(reviewId);
  const displayAdvantage   = isDemoReview ? t('demo_review_advantage') : r.advantage;
  const displayCritique    = isDemoReview ? t('demo_review_critique') : r.critique;
  const displaySuggestions = isDemoReview ? t('demo_review_suggestions') : r.suggestions;
  const weakestKey = getWeakestDimKey(r.scores);
  const weakestDim = SCORE_DIMS.find((d) => d.key === weakestKey) ?? SCORE_DIMS[0];
  const scoreLabelColor = getScoreLabelColor(r.final_score);
  const scoreLabel = t(getScoreLabelKey(r.final_score));
  const scoreSummary = generateScoreSummary(r.scores, SCORE_DIMS, locale);

  // Determine if quota is low for conversion banner
  const { remaining: quotaRemaining, total: quotaTotal } = getEffectiveQuota(
    usage,
    review.mode === 'pro' ? 'pro' : 'flash'
  );
  const isLowQuota =
    quotaRemaining !== null &&
    quotaTotal !== null &&
    quotaTotal > 0 &&
    (quotaRemaining <= 2 || quotaRemaining / quotaTotal <= 0.2);
  const plan = userInfo?.plan ?? 'guest';
  const isPublicGalleryContext = isGalleryBackHref;
  const canManageReview = Boolean(review.viewer_is_owner);
  const showPersonalActions = !isPublicGalleryContext;
  const showOwnerActions = canManageReview && !isPublicGalleryContext;
  const showGalleryCta = showOwnerActions;
  const gallerySaved = Boolean(review.gallery_visible);
  const isLowScore = r.final_score < 5.0;
  const reviewPromoCopy = (() => {
    if (locale === 'ja') {
      if (plan === 'guest') {
        return {
          title: 'ログインして、この一枚をもっと深く見直す',
          body: isLowQuota
            ? `本日の残り回数は ${quotaRemaining ?? 0} 回です。まずログインして Free 枠を解放し、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。`
            : 'ログインするとこの結果を保存しつつ、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。',
        };
      }

      if (isLowQuota) {
        return {
          title: `残り ${quotaRemaining ?? 0} 回です。次の比較は Pro が向いています`,
          body: 'このまま複数の写真を見比べるなら、Pro のほうが止まらず進められます。現在の初回価格は $2.99/月です。',
        };
      }

      if (isLowScore) {
        return {
          title: 'この一枚は Pro で深掘りする価値があります',
          body: '点数が伸び悩んだ写真ほど、短い総評より深い分解が効きます。今なら $2.99/月の初回価格で始められます。',
        };
      }

      return {
        title: 'この結果を次の改善につなげるなら Pro が早いです',
        body: 'より深い分析と長期履歴があれば、次の調整まで一気に進めやすくなります。現在の初回価格は $2.99/月です。',
      };
    }

    if (locale === 'en') {
      if (plan === 'guest') {
        return {
          title: 'Sign in to take this result further',
          body: isLowQuota
            ? `You only have ${quotaRemaining ?? 0} critiques left today. Sign in first to unlock Free usage, then move straight into deeper Pro critique at the current $2.99/month launch price.`
            : 'Sign in to save this result and move straight into deeper Pro critique. The current launch price is $2.99/month.',
        };
      }

      if (isLowQuota) {
        return {
          title: `Only ${quotaRemaining ?? 0} critiques left. Pro fits the next round better`,
          body: 'If you are about to compare more shots, Pro lets you keep going without rationing each upload. The current launch price is $2.99/month.',
        };
      }

      if (isLowScore) {
        return {
          title: 'This photo is a good candidate for a deeper Pro breakdown',
          body: 'Lower-scoring images usually need more than a quick summary. Pro gives a fuller diagnosis, and the current launch price is $2.99/month.',
        };
      }

      return {
        title: 'If you want the next improvement step faster, switch this flow to Pro',
        body: 'Deeper critique plus permanent history makes iteration easier, and Pro is currently available at $2.99/month.',
      };
    }

    if (plan === 'guest') {
      return {
        title: '登录后，把这张结果继续往下深挖',
        body: isLowQuota
          ? `你今天只剩 ${quotaRemaining ?? 0} 次评图了。先登录解锁 Free，再直接切到 Pro 深度分析。当前首发优惠价为 $2.99/月。`
          : '登录后不仅能保存这次结果，还能直接继续看更深入的 Pro 分析。当前首发优惠价为 $2.99/月。',
      };
    }

    if (isLowQuota) {
      return {
        title: `当前只剩 ${quotaRemaining ?? 0} 次额度，下一轮更适合直接用 Pro`,
        body: '如果你准备继续比较更多照片，Pro 会比反复计算额度更顺手。当前首发优惠价为 $2.99/月。',
      };
    }

    if (isLowScore) {
      return {
        title: '这张照片更适合用 Pro 做一次深挖',
        body: '分数偏低时，更需要完整拆解和明确修改方向，而不只是简短总结。当前首发优惠价为 $2.99/月。',
      };
    }

    return {
      title: '想把这次结果真正转成下一轮提升，可以直接升级 Pro',
      body: '更深入的分析加上永久历史记录，更适合连续复盘和稳定提升。当前首发优惠价为 $2.99/月。',
    };
  })();

  async function handleGalleryToggle() {
    if (!review || actionBusy) return;
    if (!canManageReview || plan === 'guest') {
      setActionError(galleryActionCopy.guestBlocked);
      setActionFeedback('');
      return;
    }

    const nextVisible = !gallerySaved;
    if (nextVisible) {
      setGalleryConfirmOpen(true);
      return;
    }

    await submitGalleryToggle(false);
  }

  async function submitGalleryToggle(nextVisible: boolean) {
    if (!review || actionBusy) return;

    setActionBusy('gallery');
    setActionError('');
    setActionFeedback(nextVisible ? galleryActionCopy.pendingAdd : galleryActionCopy.pendingRemove);

    try {
      setGalleryConfirmOpen(false);
      const token = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { gallery_visible: nextVisible }, token);
      setReview((prev) => (
        prev
          ? {
              ...prev,
              favorite: payload.favorite,
              gallery_visible: payload.gallery_visible,
              gallery_audit_status: payload.gallery_audit_status,
              gallery_added_at: payload.gallery_added_at,
              gallery_rejected_reason: payload.gallery_rejected_reason,
              tags: payload.tags,
              note: payload.note,
            }
          : prev
      ));
      if (!payload.gallery_visible) {
        setActionFeedback(galleryActionCopy.doneRemove);
      } else if (payload.gallery_audit_status === 'approved') {
        setActionFeedback(galleryActionCopy.doneApproved);
      } else {
        setActionFeedback(payload.gallery_rejected_reason || galleryActionCopy.doneRejected);
      }
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBackendShareLink() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('share');
    setActionError('');
    setActionFeedback(actionCopy.sharePending);

    try {
      const token = await ensureToken();
      const payload = await createReviewShare(review.review_id, token);
      const sharePageUrl = new URL(`/share/${payload.share_token}`, window.location.origin).toString();
      await navigator.clipboard.writeText(sharePageUrl);
      setLinkCopied(true);
      setActionFeedback(actionCopy.shareDone);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleBackendExportSummary() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('export');
    setActionError('');
    setActionFeedback(actionCopy.exportPending);

    try {
      const token = await ensureToken();
      const payload = await exportReview(review.review_id, token);
      const lines = [
        `# ${exportSummaryCopy.title}`,
        '',
        `- ${exportSummaryCopy.exportedAt}: ${new Date(payload.review.exported_at).toLocaleString(locale)}`,
        `- ${exportSummaryCopy.createdAt}: ${new Date(payload.review.created_at).toLocaleString(locale)}`,
        '',
        `## ${exportSummaryCopy.reviewInfo}`,
        `- ${exportSummaryCopy.reviewId}: ${payload.review.review_id}`,
        `- ${exportSummaryCopy.mode}: ${payload.review.mode === 'pro' ? 'Pro' : 'Flash'}`,
        `- ${exportSummaryCopy.imageType}: ${getImageTypeLabelForLocale(locale, payload.review.image_type)}`,
        `- ${exportSummaryCopy.model}: ${payload.review.model_name}${payload.review.model_version ? ` (${payload.review.model_version})` : ''}`,
        `- ${exportSummaryCopy.scoreSummary}: ${payload.review.final_score.toFixed(1)} / 10`,
        `- ${exportSummaryCopy.favorite}: ${payload.review.favorite ? exportSummaryCopy.yes : exportSummaryCopy.no}`,
      ];

      if (payload.review.source_review_id) {
        lines.push(`- ${exportSummaryCopy.sourceReviewId}: ${payload.review.source_review_id}`);
      }
      if (payload.review.tags.length > 0) {
        lines.push(`- ${exportSummaryCopy.tags}: ${payload.review.tags.join(' / ')}`);
      }
      if (payload.review.note) {
        lines.push(`- ${exportSummaryCopy.note}: ${payload.review.note}`);
      }

      lines.push(
        '',
        `## ${exportSummaryCopy.scores}`,
        `- ${t('score_composition')}: ${payload.review.scores.composition.toFixed(1)}`,
        `- ${t('score_lighting')}: ${payload.review.scores.lighting.toFixed(1)}`,
        `- ${t('score_color')}: ${payload.review.scores.color.toFixed(1)}`,
        `- ${t('score_impact')}: ${payload.review.scores.impact.toFixed(1)}`,
        `- ${t('score_technical')}: ${payload.review.scores.technical.toFixed(1)}`,
        '',
        `## ${exportSummaryCopy.strengths}`,
        payload.review.advantage || '-',
        '',
        `## ${exportSummaryCopy.issues}`,
        payload.review.critique || '-',
        '',
        `## ${exportSummaryCopy.suggestions}`,
        payload.review.suggestions || '-',
        '',
        `## ${exportSummaryCopy.photoInfo}`,
        `- ${exportSummaryCopy.photoId}: ${payload.photo.photo_id}`,
      );

      const blob = new Blob([lines.join('\n')], {
        type: 'text/markdown;charset=utf-8',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportSummaryCopy.filePrefix}-${review.review_id.slice(0, 8)}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setActionFeedback(actionCopy.exportDone);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  async function handleFavoriteToggle() {
    if (!review || actionBusy || !canManageReview) return;

    const nextFavorite = !Boolean(review.favorite);
    setActionBusy('favorite');
    setActionError('');
    setActionFeedback(nextFavorite ? favoriteCopy.pendingAdd : favoriteCopy.pendingRemove);

    try {
      const token = await ensureToken();
      const payload = await updateReviewMeta(review.review_id, { favorite: nextFavorite }, token);
      setReview((prev) => (
        prev
          ? {
              ...prev,
              favorite: payload.favorite,
              tags: payload.tags,
              note: payload.note,
            }
          : prev
      ));
      setActionFeedback(payload.favorite ? favoriteCopy.doneAdd : favoriteCopy.doneRemove);
    } catch (err) {
      setActionFeedback('');
      setActionError(formatUserFacingError(t, err, t('review_err_fetch')));
    } finally {
      setActionBusy(null);
    }
  }

  function handleReplayReview() {
    if (!review || actionBusy || !canManageReview) return;

    setActionBusy('replay');
    setActionError('');
    setActionFeedback(actionCopy.replayPending);

    const nextParams = new URLSearchParams({
      source_review_id: review.review_id,
      photo_id: review.photo_id,
      mode: review.mode,
      image_type: review.image_type ?? review.result.image_type ?? 'default',
    });

    router.push(`/workspace?${nextParams.toString()}`);
  }

  return (
    <div className="pt-14 min-h-screen">
      {galleryConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          onClick={() => setGalleryConfirmOpen(false)}
        >
          <div className="absolute inset-0 bg-[#050505]/98" />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-[24px] border border-[#2b2722] bg-[#11100e] p-6 shadow-[0_32px_96px_rgba(0,0,0,0.72)] animate-fade-in"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="gallery-confirm-title"
          >
            <button
              type="button"
              onClick={() => setGalleryConfirmOpen(false)}
              className="absolute right-4 top-4 rounded-full border border-border-subtle p-2 text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
              aria-label={galleryActionCopy.dialogCancel}
            >
              <X size={14} />
            </button>

            <div className="mb-5">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-gold/80">
                <LayoutGrid size={12} />
                {galleryActionCopy.dialogLabel}
              </p>
              <h2 id="gallery-confirm-title" className="font-display text-3xl text-ink">
                {galleryActionCopy.dialogTitle}
              </h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{galleryActionCopy.dialogBody}</p>
              <div className="mt-4 rounded-2xl border border-[#26231f] bg-[#161412] px-4 py-3 text-xs leading-6 text-ink-muted">
                {galleryActionCopy.dialogFootnote}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setGalleryConfirmOpen(false)}
                className="rounded-full border border-border px-4 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
              >
                {galleryActionCopy.dialogCancel}
              </button>
              <button
                type="button"
                onClick={() => submitGalleryToggle(true)}
                disabled={actionBusy !== null}
                className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:opacity-60"
              >
                {galleryActionCopy.dialogConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">

        {/* Back */}
        <button
          onClick={handleBackNavigation}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          {backLabel}
        </button>

        {usageError && (
          <div className="mb-6 flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} className="shrink-0" />
            <span>{usageError}</span>
          </div>
        )}

        {/* ── Score hero strip ─────────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-border-subtle bg-raised/50 px-6 py-5 flex items-center gap-5">
          <FinalScoreRing score={r.final_score} />
          <div className="min-w-0">
            <div className={`font-display text-2xl leading-none ${scoreLabelColor}`}>{scoreLabel}</div>
            <div className="text-xs text-ink-muted mt-1.5 leading-relaxed">{t('review_score_dims_basis')}</div>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-ink-subtle">
            <TrendingDown size={11} className="text-rust shrink-0" />
            <span>{t('review_score_lowest')}:</span>
            <span className="text-rust/70 ml-0.5">{weakestDim.label}</span>
          </div>
        </div>

        {/* ── Two-column layout ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">

          {/* ── LEFT: Photo + Scores ──────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 min-w-0">
            <div className="rounded-xl overflow-hidden border border-border-subtle bg-raised">
              {/* Photo */}
              {photoUrl && !photoError ? (
                <div
                  className="photo-frame relative cursor-zoom-in group"
                  onClick={() => {
                    setZoomMounted(true);
                    setZoomOpen(true);
                  }}
                  title={t('img_zoom_label')}
                >
                  <img
                    src={photoUrl}
                    alt={t('review_photo_alt')}
                    className="w-full max-w-full h-auto object-contain max-h-[65vh]"
                    onError={() => {
                      void handlePhotoError();
                    }}
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                    loading="eager"
                    decoding="async"
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-void/30">
                    <ZoomIn size={32} className="text-white drop-shadow-lg" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-ink-subtle text-sm">
                  {t('review_no_image')}
                </div>
              )}

              {/* Dimension scores */}
              <div className="border-t border-border-subtle px-5 py-4 space-y-2">
                {SCORE_DIMS.map((d) => {
                  const score = (r.scores as unknown as Record<string, number>)[d.key] ?? 0;
                  const isWeakest = d.key === weakestKey;
                  const isActive = activeDim === d.key;
                  const hasTarget = (DIM_TO_TAGS[d.key]?.length ?? 0) > 0;
                  return (
                    <div
                      key={d.key}
                      className={`group/dim relative rounded px-1 -mx-1 py-0.5 transition-colors ${hasTarget ? 'cursor-pointer' : ''} ${isActive ? 'bg-gold/10' : hasTarget ? 'hover:bg-void/30' : ''}`}
                      onClick={() => handleDimClick(d.key)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-xs w-16 shrink-0 ${isWeakest ? 'text-rust' : isActive ? 'text-gold' : 'text-ink-muted'}`}>
                          {d.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-void/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${getDimColorClass(score)}`}
                            style={{ width: `${score * 10}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-7 text-right shrink-0 ${getDimTextClass(score)}`}>
                          {score.toFixed(1)}
                        </span>
                        {isWeakest && <TrendingDown size={10} className="text-rust shrink-0" />}
                        {/* Hover arrow: appears only when the row has a candidate tag and is not already weakest-marked */}
                        {hasTarget && (
                          <span className="text-[10px] text-gold/0 group-hover/dim:text-gold/50 transition-colors shrink-0 select-none" aria-hidden>↓</span>
                        )}
                      </div>
                      {/* Dimension tooltip: shows description + click hint */}
                      <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-10 hidden group-hover/dim:block w-60 rounded-md bg-surface border border-border-subtle px-3 py-2 shadow-lg">
                        <p className="text-[11px] text-ink-muted leading-relaxed">{d.desc}</p>
                        {hasTarget && (
                          <p className="text-[10px] text-gold/70 mt-1.5 pt-1.5 border-t border-border-subtle flex items-center gap-1">
                            <span aria-hidden>↓</span>
                            {t('dim_click_hint')}
                          </p>
                        )}
                        <div className="absolute left-4 top-full w-2 h-2 overflow-hidden">
                          <div className="w-2 h-2 bg-surface border-r border-b border-border-subtle rotate-45 -translate-y-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta footer */}
              <div className="border-t border-border-subtle px-5 py-2.5 space-y-0.5">
                <p className="text-xs text-ink-subtle font-mono">
                  {new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}
                </p>
                {imgNaturalSize && (
                  <p className="text-xs text-ink-subtle font-mono">
                    {t('review_img_resolution')}: {imgNaturalSize.w} × {imgNaturalSize.h}
                  </p>
                )}
                {review.exif_data && (() => {
                  const exif = review.exif_data;
                  const make = typeof exif.Make === 'string' ? exif.Make.trim() : '';
                  const model = typeof exif.Model === 'string' ? exif.Model.trim() : '';
                  const camera = model.startsWith(make) || !make ? model : `${make} ${model}`;
                  const lens = typeof exif.LensModel === 'string' ? exif.LensModel.trim() : '';
                  const focalRaw = exif.FocalLength;
                  const focal35 = exif.FocalLengthIn35mm;
                  const focal = typeof focalRaw === 'number' && focalRaw > 0
                    ? `${focalRaw % 1 === 0 ? focalRaw : focalRaw.toFixed(1)} mm${typeof focal35 === 'number' && focal35 > 0 && focal35 !== focalRaw ? ` (35mm: ${focal35} mm)` : ''}`
                    : '';
                  const fNumber = exif.FNumber;
                  const aperture = typeof fNumber === 'number' && fNumber > 0 ? `f/${fNumber % 1 === 0 ? fNumber : fNumber.toFixed(1)}` : '';
                  const shutter = formatExposureValue(exif.ExposureTime);
                  const iso = typeof exif.ISO === 'number' && exif.ISO > 0 ? String(exif.ISO) : '';
                  const rows: [string, string][] = [
                    [t('review_exif_camera'), camera],
                    [t('review_exif_lens'), lens],
                    [t('review_exif_focal'), focal],
                    [t('review_exif_aperture'), aperture],
                    [t('review_exif_shutter'), shutter],
                    [t('review_exif_iso'), iso],
                  ].filter(([, v]) => v) as [string, string][];
                  if (rows.length === 0) return null;
                  return (
                    <div className="pt-1.5 mt-0.5 border-t border-border-subtle/50 space-y-0.5">
                      <p className="text-[10px] text-ink-muted uppercase tracking-widest font-mono mb-1">{t('review_exif_params')}</p>
                      {rows.map(([label, value]) => (
                        <p key={label} className="text-xs text-ink-subtle font-mono truncate">
                          <span className="text-ink-muted">{label}: </span>{value}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div className="space-y-6 min-w-0">

            {/* Header */}
            <div>
              <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">— {t('review_page_label')}</p>
              <h1 className="font-display text-3xl sm:text-4xl mb-2">{t('review_page_headline')}</h1>
              <p className="text-sm text-ink-muted mb-3 leading-relaxed">{scoreSummary}</p>
              {/* Metadata row: mode · status · date */}
              <div className="flex items-center gap-2 text-xs text-ink-subtle">
                <span className={review.mode === 'pro' ? 'text-gold font-medium' : 'text-ink-muted'}>
                  {review.mode === 'pro' ? 'Pro' : 'Flash'}
                </span>
                <span>·</span>
                <span className="text-sage">{t('status_succeeded')}</span>
                <span>·</span>
                <span>{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
            </div>

            {/* Action buttons */}
            {showPersonalActions && (
              <div className="flex flex-wrap gap-2.5">
                <button
                  onClick={() => router.push('/workspace')}
                  className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
                >
                  <Upload size={13} />
                  {t('review_btn_upload_next')}
                </button>
                {showOwnerActions && (
                  <>
                    <button
                      onClick={handleReplayReview}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors disabled:opacity-60"
                    >
                      <RotateCcw size={13} />
                      {t('review_btn_again')}
                    </button>
                    {userInfo?.plan !== 'guest' && (
                      <Link
                        href="/account/reviews"
                        className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
                      >
                        <History size={13} />
                        {t('review_btn_history_all')}
                      </Link>
                    )}
                    <button
                      onClick={handleFavoriteToggle}
                      disabled={actionBusy !== null}
                      className={`flex items-center gap-2 px-4 py-2 border text-sm rounded transition-colors disabled:opacity-60 ${
                        review.favorite
                          ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                          : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
                      }`}
                    >
                      <Heart size={13} className={review.favorite ? 'fill-current' : ''} />
                      {review.favorite ? favoriteCopy.remove : favoriteCopy.add}
                    </button>
                    <button
                      onClick={handleBackendShareLink}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
                    >
                      {linkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
                      {linkCopied ? t('review_link_copied') : t('review_share_link')}
                    </button>
                    <button
                      onClick={handleBackendExportSummary}
                      disabled={actionBusy !== null}
                      className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors disabled:opacity-60"
                    >
                      <Download size={13} />
                      {t('review_export_summary')}
                    </button>
                  </>
                )}
              </div>
            )}

            {(actionFeedback || actionError) && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${actionError ? 'border-rust/20 bg-rust/5 text-rust' : 'border-sage/20 bg-sage/5 text-sage'}`}>
                {actionError || actionFeedback}
              </div>
            )}

            <div className="border-t border-border-subtle" />

            {/* Critique sections */}
            <div className="space-y-6 max-w-2xl">
              <CritiqueSection
                accent="text-sage"
                borderColor="border-sage"
                bgColor="bg-sage/5"
                icon={<ThumbsUp size={13} />}
                title={t('review_advantage')}
                body={displayAdvantage}
                isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust"
                borderColor="border-rust"
                bgColor="bg-rust/5"
                icon={<AlertTriangle size={13} />}
                title={t('review_critique')}
                body={displayCritique}
                isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-gold"
                borderColor="border-gold"
                bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />}
                title={t('review_suggestions')}
                body={displaySuggestions}
                showTags
                showFeedback
                isPro={isPro}
                highlightTop={2}
                highlightedId={highlightedCardId}
              />
            </div>

            {showGalleryCta && (
              <section className="relative overflow-hidden rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.14),transparent_36%),rgba(18,16,13,0.76)] px-5 py-5">
                <div className="absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:20px_20px]" />
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-xl">
                    <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold/80">
                      <LayoutGrid size={12} />
                      {t('review_gallery_label')}
                    </p>
                    <h2 className="font-display text-2xl text-ink">{reviewGalleryCardCopy.title}</h2>
                    <p className="mt-2 text-sm leading-7 text-ink-muted">{reviewGalleryCardCopy.body}</p>
                  </div>

                  <div className="flex shrink-0 flex-col items-stretch gap-2 lg:min-w-[172px]">
                    <button
                      type="button"
                      onClick={handleGalleryToggle}
                      disabled={actionBusy !== null}
                      className={`inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-medium leading-5 whitespace-nowrap text-center transition-colors disabled:opacity-60 ${
                        gallerySaved
                          ? 'border border-sage/30 bg-sage/10 text-sage hover:bg-sage/15'
                          : 'bg-gold text-void hover:bg-gold-light'
                      }`}
                    >
                      {gallerySaved ? <BookmarkCheck size={14} /> : <BookmarkPlus size={14} />}
                      {gallerySaved ? t('review_gallery_remove') : t('review_gallery_add')}
                    </button>
                    <Link
                      href="/gallery"
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-border-subtle px-5 py-3 text-sm leading-5 whitespace-nowrap text-center text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
                    >
                      <LayoutGrid size={14} />
                      {t('review_gallery_open')}
                    </Link>
                  </div>
                </div>
              </section>
            )}

            {/* AI disclaimer */}
            <p className="text-xs text-ink-subtle pt-2 border-t border-border-subtle">
              {t('review_ai_disclaimer')}
            </p>

            {showPersonalActions && (
              <ProPromoCard
                plan={plan === 'guest' ? 'guest' : plan === 'pro' ? 'pro' : 'free'}
                scene="review"
                title={plan === 'pro' ? undefined : reviewPromoCopy.title}
                body={plan === 'pro' ? undefined : reviewPromoCopy.body}
                fallbackRedirectUrl={`/reviews/${review.review_id}`}
                className="mt-2"
              />
            )}

          </div>
        </div>
      </div>

      {/* ── Image zoom overlay ───────────────────────────────────────────── */}
      {zoomMounted && photoUrl && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm transition-opacity duration-200 ${zoomOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
          onClick={() => setZoomOpen(false)}
          aria-hidden={!zoomOpen}
        >
          <button
            onClick={() => setZoomOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-raised/80 border border-border-subtle text-ink-muted hover:text-ink transition-colors"
            aria-label={t('img_zoom_close')}
          >
            <X size={18} />
          </button>
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photoUrl}
              alt={t('review_photo_zoom_alt')}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              loading="eager"
              decoding="async"
            />
          </div>
        </div>
      )}
    </div>
  );
}
