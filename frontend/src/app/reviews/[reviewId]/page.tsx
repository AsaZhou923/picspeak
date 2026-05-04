'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, History, Lightbulb, ThumbsDown, ThumbsUp, TrendingDown } from 'lucide-react';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useAuth } from '@/lib/auth-context';
import { FinalScoreRing } from '@/components/ui/ScoreRing';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { isDemoReviewId } from '@/lib/demo-review';
import { useI18n } from '@/lib/i18n';
import {
  CARD_HIGHLIGHT_DURATION_MS,
  DIM_TO_TAGS,
  generateScoreSummary,
  getDimDescByType,
  getEffectiveQuota,
  getReviewGalleryCardCopy,
  getScoreLabelColor,
  getScoreLabelKey,
  getWeakestDimKey,
} from '@/lib/review-page-copy';
import { useReviewDetail } from '@/features/reviews/hooks/useReviewDetail';
import { useReviewPhoto } from '@/features/reviews/hooks/useReviewPhoto';
import { useReviewActions } from '@/features/reviews/hooks/useReviewActions';
import { useReviewUsage } from '@/features/reviews/hooks/useReviewUsage';
import { CritiqueSection } from '@/features/reviews/components/CritiqueSection';
import { GalleryConfirmDialog } from '@/features/reviews/components/GalleryConfirmDialog';
import { ReviewScorePanel } from '@/features/reviews/components/ReviewScorePanel';
import { ReviewActionBar } from '@/features/reviews/components/ReviewActionBar';
import { ReviewGrowthLoopPanel } from '@/features/reviews/components/ReviewGrowthLoopPanel';
import { ReviewReferenceGenerationPanel } from '@/features/reviews/components/ReviewReferenceGenerationPanel';
import { ReviewGalleryPanel } from '@/features/reviews/components/ReviewGalleryPanel';
import { ImageZoomOverlay } from '@/features/reviews/components/ImageZoomOverlay';
import { buildNextShootChecklist, type NextShootChecklistItem } from '@/lib/review-growth';
import { getProUpgradeTriggerCopy, type ProUpgradeTrigger } from '@/lib/pro-conversion';
import { trackProductEvent } from '@/lib/product-analytics';

function getReviewSourceContextCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Replay Context',
      title: '元の講評につながる再分析です',
      body: '今回の結果は、以前の講評から続く撮影または修正として記録されています。',
      sourceReview: 'Source review',
      openSource: '元の講評を見る',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Replay Context',
      title: 'This critique is linked to a source review',
      body: 'Use the source review to compare whether the retake or same-photo fix moved the next-shoot goal forward.',
      sourceReview: 'Source review',
      openSource: 'Open source review',
    };
  }
  return {
    label: '复拍上下文',
    title: '这次点评已关联来源点评',
    body: '你可以回到来源点评，对照这次复拍或同图修正是否推进了上一轮目标。',
    sourceReview: '来源点评',
    openSource: '查看来源点评',
  };
}

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { userInfo, token } = useAuth();

  const reviewId = params.reviewId as string;
  const backHref = searchParams.get('back') ?? '/workspace';
  const isGalleryBackHref = backHref.startsWith('/gallery');
  const backLabel = isGalleryBackHref
    ? t('nav_gallery')
    : backHref === '/account/reviews'
      ? t('review_back_history')
      : backHref === '/account/favorites'
        ? t('review_nav_favorites')
        : t('review_back_workspace');

  function handleBackNavigation() {
    if (isGalleryBackHref && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(backHref);
  }

  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);

  const { review, setReview, loading, error, initialPhotoUrl } = useReviewDetail(reviewId);
  const {
    photoUrl, photoError, imgNaturalSize, setImgNaturalSize, handlePhotoError,
    zoomOpen, setZoomOpen, zoomMounted, setZoomMounted,
  } = useReviewPhoto({ review, setReview, initialPhotoUrl });
  const {
    linkCopied, galleryConfirmOpen, setGalleryConfirmOpen, actionBusy, actionFeedback, actionError,
    galleryActionCopy, favoriteCopy,
    handleGalleryToggle, submitGalleryToggle, handleBackendShareLink,
    handleBackendExportSummary, handleFavoriteToggle, handleReplayReview,
  } = useReviewActions({ review, setReview });
  const { usage, usageError } = useReviewUsage();

  function handleDimClick(dimKey: string) {
    const tags = DIM_TO_TAGS[dimKey];
    if (!tags || tags.length === 0) return;
    for (const tag of tags) {
      const el = document.querySelector<HTMLElement>(`[data-suggestion-tags~="${tag}"]`);
      if (el?.id) {
        setActiveDim(dimKey);
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedCardId(el.id);
          setTimeout(() => setHighlightedCardId(null), CARD_HIGHLIGHT_DURATION_MS);
        }, 150);
        return;
      }
    }
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

  const activeReview = review;
  const r = activeReview.result;
  const isPro = activeReview.mode === 'pro';
  const isDemoReview = isDemoReviewId(reviewId);
  const displayAdvantage   = isDemoReview ? t('demo_review_advantage') : r.advantage;
  const displayCritique    = isDemoReview ? t('demo_review_critique') : r.critique;
  const displaySuggestions = isDemoReview ? t('demo_review_suggestions') : r.suggestions;
  const resultImageType = r.image_type ?? 'default';
  const SCORE_DIMS = [
    { key: 'composition', label: t('score_composition'), desc: getDimDescByType(locale, resultImageType, 'composition') },
    { key: 'lighting',    label: t('score_lighting'),    desc: getDimDescByType(locale, resultImageType, 'lighting') },
    { key: 'color',       label: t('score_color'),       desc: getDimDescByType(locale, resultImageType, 'color') },
    { key: 'impact',      label: t('score_impact'),      desc: getDimDescByType(locale, resultImageType, 'impact') },
    { key: 'technical',   label: t('score_technical'),   desc: getDimDescByType(locale, resultImageType, 'technical') },
  ];
  const weakestKey = getWeakestDimKey(r.scores);
  const weakestDim = SCORE_DIMS.find((d) => d.key === weakestKey) ?? SCORE_DIMS[0];
  const scoreLabelColor = getScoreLabelColor(r.final_score);
  const scoreLabel = t(getScoreLabelKey(r.final_score));
  const scoreSummary = generateScoreSummary(r.scores, SCORE_DIMS, locale);
  const { remaining: quotaRemaining, total: quotaTotal } = getEffectiveQuota(usage, isPro ? 'pro' : 'flash');
  const isLowQuota = quotaRemaining !== null && quotaTotal !== null && quotaTotal > 0
    && (quotaRemaining <= 2 || quotaRemaining / quotaTotal <= 0.2);
  const plan = userInfo?.plan ?? 'guest';
  const canManageReview = Boolean(review.viewer_is_owner);
  const showPersonalActions = !isGalleryBackHref;
  const showOwnerActions = canManageReview && !isGalleryBackHref;
  const gallerySaved = Boolean(review.gallery_visible);
  const isLowScore = r.final_score < 5.0;
  const reviewGalleryCardCopy = getReviewGalleryCardCopy(locale);
  const nextShootChecklist = buildNextShootChecklist(displaySuggestions, 3, r.scores);
  const sourceContextCopy = getReviewSourceContextCopy(locale);

  function handleUploadNewRound() {
    const primaryAction = nextShootChecklist[0];
    if (primaryAction) {
      void trackProductEvent('next_shoot_action_clicked', {
        token: token ?? undefined,
        pagePath: `/reviews/${activeReview.review_id}`,
        locale,
        metadata: {
          review_id: activeReview.review_id,
          photo_id: activeReview.photo_id,
          mode: activeReview.mode,
          image_type: activeReview.image_type ?? activeReview.result.image_type ?? 'default',
          dimension: primaryAction.dimension,
          action_index: 1,
          action_title: primaryAction.title,
          retake_intent: 'new_photo_retake',
          trigger: 'new_photo_panel',
        },
      });
    }
    const nextParams = new URLSearchParams({
      source_review_id: activeReview.review_id,
      mode: activeReview.mode,
      image_type: activeReview.image_type ?? activeReview.result.image_type ?? 'default',
      retake_intent: 'new_photo_retake',
    });
    if (primaryAction) {
      nextParams.set('next_shoot_action', primaryAction.detail || primaryAction.title);
      nextParams.set('next_shoot_dimension', primaryAction.dimension);
    }
    router.push(`/workspace?${nextParams.toString()}`);
  }

  function handleChecklistAction(item: NextShootChecklistItem, index: number) {
    void trackProductEvent('next_shoot_action_clicked', {
      token: token ?? undefined,
      pagePath: `/reviews/${activeReview.review_id}`,
      locale,
      metadata: {
        review_id: activeReview.review_id,
        photo_id: activeReview.photo_id,
        mode: activeReview.mode,
        image_type: activeReview.image_type ?? activeReview.result.image_type ?? 'default',
        dimension: item.dimension,
        action_index: index + 1,
        action_title: item.title,
        retake_intent: 'new_photo_retake',
        trigger: 'checklist_item',
      },
    });
    const nextParams = new URLSearchParams({
      source_review_id: activeReview.review_id,
      mode: activeReview.mode,
      image_type: activeReview.image_type ?? activeReview.result.image_type ?? 'default',
      retake_intent: 'new_photo_retake',
      next_shoot_action: item.detail || item.title,
      next_shoot_dimension: item.dimension,
    });
    router.push(`/workspace?${nextParams.toString()}`);
  }

  const reviewPromoTrigger: ProUpgradeTrigger =
    plan === 'guest'
      ? 'guest_save'
      : isLowQuota
        ? 'quota_floor'
        : isLowScore
          ? 'deeper_result'
          : 'retake_compare';
  const reviewPromoCopy = getProUpgradeTriggerCopy(locale, reviewPromoTrigger, {
    remaining: quotaRemaining,
  });

  return (
    <div className="pt-14 min-h-screen">
      {galleryConfirmOpen && (
        <GalleryConfirmDialog
          onClose={() => setGalleryConfirmOpen(false)}
          onConfirm={() => submitGalleryToggle(true)}
          actionBusy={actionBusy}
          galleryActionCopy={galleryActionCopy}
        />
      )}
      <div className="mx-auto max-w-7xl px-6 py-12 animate-fade-in">
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

        <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)] xl:gap-8">
          <ReviewScorePanel
            review={review}
            photoUrl={photoUrl}
            photoError={photoError}
            imgNaturalSize={imgNaturalSize}
            activeDim={activeDim}
            onImgLoad={setImgNaturalSize}
            onPhotoError={handlePhotoError}
            onZoomOpen={() => { setZoomMounted(true); setZoomOpen(true); }}
            onDimClick={handleDimClick}
          />

          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">— {t('review_page_label')}</p>
              <h1 className="font-display text-3xl sm:text-4xl mb-2">{t('review_page_headline')}</h1>
              <p className="text-sm text-ink-muted mb-3 leading-relaxed">{scoreSummary}</p>
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

            {activeReview.source_review_id && (
              <div className="rounded-2xl border border-sage/25 bg-sage/10 px-4 py-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-sage">
                  <History size={14} />
                  <span>{sourceContextCopy.label}</span>
                </div>
                <h2 className="font-display text-xl text-ink">{sourceContextCopy.title}</h2>
                <p className="mt-2 text-sm leading-6 text-ink-muted">{sourceContextCopy.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1 text-ink-subtle">
                    {sourceContextCopy.sourceReview}: {activeReview.source_review_id}
                  </span>
                  <Link
                    href={`/reviews/${activeReview.source_review_id}?back=/reviews/${activeReview.review_id}`}
                    className="rounded-full border border-sage/30 px-3 py-1 font-medium text-sage transition-colors hover:bg-sage/10"
                  >
                    {sourceContextCopy.openSource}
                  </Link>
                </div>
              </div>
            )}

            {showOwnerActions && (
              <ReviewActionBar
                review={review}
                showOwnerActions={showOwnerActions}
                showGuestHistoryLink={userInfo?.plan === 'guest'}
                linkCopied={linkCopied}
                actionBusy={actionBusy}
                favoriteCopy={favoriteCopy}
                onFavoriteToggle={handleFavoriteToggle}
                onShareLink={handleBackendShareLink}
                onExportSummary={handleBackendExportSummary}
                t={t}
              />
            )}

            {(actionFeedback || actionError) && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${actionError ? 'border-rust/20 bg-rust/5 text-rust' : 'border-sage/20 bg-sage/5 text-sage'}`}>
                {actionError || actionFeedback}
              </div>
            )}

            <div className="border-t border-border-subtle" />

            <div className="space-y-5">
              <div className="grid gap-5 xl:grid-cols-2">
                <CritiqueSection
                  accent="text-sage" borderColor="border-sage" bgColor="bg-sage/5"
                  icon={<ThumbsUp size={13} />} title={t('review_advantage')}
                  body={displayAdvantage} isPro={isPro}
                />
                <CritiqueSection
                  accent="text-rust" borderColor="border-rust" bgColor="bg-rust/5"
                  icon={<ThumbsDown size={13} />} title={t('review_critique')}
                  body={displayCritique} isPro={isPro}
                />
              </div>

              {showOwnerActions && (
                <ReviewReferenceGenerationPanel
                  reviewId={activeReview.review_id}
                  photoId={activeReview.photo_id}
                  imageType={activeReview.image_type ?? activeReview.result.image_type ?? 'default'}
                  suggestions={displaySuggestions}
                  plan={plan}
                  locale={locale}
                  sourceAspect={imgNaturalSize}
                />
              )}

              <CritiqueSection
                accent="text-gold" borderColor="border-gold" bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />} title={t('review_suggestions')}
                body={displaySuggestions} showTags showFeedback isPro={isPro}
                highlightTop={2} highlightedId={highlightedCardId}
              />
            </div>

            {showOwnerActions && (
              <ReviewGrowthLoopPanel
                locale={locale}
                checklist={nextShootChecklist}
                actionBusy={actionBusy}
                onReplayReview={handleReplayReview}
                onUploadNew={handleUploadNewRound}
                onChecklistAction={handleChecklistAction}
                t={t}
              />
            )}

            {showOwnerActions && (
              <ReviewGalleryPanel
                review={review}
                gallerySaved={gallerySaved}
                actionBusy={actionBusy}
                reviewGalleryCardCopy={reviewGalleryCardCopy}
                onGalleryToggle={handleGalleryToggle}
                t={t}
              />
            )}

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

      <ImageZoomOverlay
        zoomMounted={zoomMounted}
        zoomOpen={zoomOpen}
        photoUrl={photoUrl}
        onClose={() => setZoomOpen(false)}
        t={t}
      />
    </div>
  );
}
