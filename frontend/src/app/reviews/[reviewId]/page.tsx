'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ArrowLeft, Lightbulb, ThumbsDown, ThumbsUp, TrendingDown } from 'lucide-react';
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
import { ReviewGalleryPanel } from '@/features/reviews/components/ReviewGalleryPanel';
import { ImageZoomOverlay } from '@/features/reviews/components/ImageZoomOverlay';

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { userInfo } = useAuth();

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

  const r = review.result;
  const isPro = review.mode === 'pro';
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

  const reviewPromoCopy = (() => {
    if (locale === 'ja') {
      if (plan === 'guest') return { title: 'ログインして、この一枚をもっと深く見直す', body: isLowQuota ? `本日の残り回数は ${quotaRemaining ?? 0} 回です。まずログインして Free 枠を解放し、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。` : 'ログインするとこの結果を保存しつつ、そのまま Pro の深い分析へ進めます。現在の初回価格は $2.99/月です。' };
      if (isLowQuota) return { title: `残り ${quotaRemaining ?? 0} 回です。次の比較は Pro が向いています`, body: 'このまま複数の写真を見比べるなら、Pro のほうが止まらず進められます。現在の初回価格は $2.99/月です。' };
      if (isLowScore) return { title: 'この一枚は Pro で深掘りする価値があります', body: '点数が伸び悩んだ写真ほど、短い総評より深い分解が効きます。今なら $2.99/月の初回価格で始められます。' };
      return { title: 'この結果を次の改善につなげるなら Pro が早いです', body: 'より深い分析と長期履歴があれば、次の調整まで一気に進めやすくなります。現在の初回価格は $2.99/月です。' };
    }
    if (locale === 'en') {
      if (plan === 'guest') return { title: 'Sign in to take this result further', body: isLowQuota ? `You only have ${quotaRemaining ?? 0} critiques left today. Sign in first to unlock Free usage, then move straight into deeper Pro critique at the current $2.99/month launch price.` : 'Sign in to save this result and move straight into deeper Pro critique. The current launch price is $2.99/month.' };
      if (isLowQuota) return { title: `Only ${quotaRemaining ?? 0} critiques left. Pro fits the next round better`, body: 'If you are about to compare more shots, Pro lets you keep going without rationing each upload. The current launch price is $2.99/month.' };
      if (isLowScore) return { title: 'This photo is a good candidate for a deeper Pro breakdown', body: 'Lower-scoring images usually need more than a quick summary. Pro gives a fuller diagnosis, and the current launch price is $2.99/month.' };
      return { title: 'If you want the next improvement step faster, switch this flow to Pro', body: 'Deeper critique plus permanent history makes iteration easier, and Pro is currently available at $2.99/month.' };
    }
    if (plan === 'guest') return { title: '登录后，把这张结果继续往下深挖', body: isLowQuota ? `你今天只剩 ${quotaRemaining ?? 0} 次评图了。先登录解锁 Free，再直接切到 Pro 深度分析。当前首发优惠价为 $2.99/月。` : '登录后不仅能保存这次结果，还能直接继续看更深入的 Pro 分析。当前首发优惠价为 $2.99/月。' };
    if (isLowQuota) return { title: `当前只剩 ${quotaRemaining ?? 0} 次额度，下一轮更适合直接用 Pro`, body: '如果你准备继续比较更多照片，Pro 会比反复计算额度更顺手。当前首发优惠价为 $2.99/月。' };
    if (isLowScore) return { title: '这张照片更适合用 Pro 做一次深挖', body: '分数偏低时，更需要完整拆解和明确修改方向，而不只是简短总结。当前首发优惠价为 $2.99/月。' };
    return { title: '想把这次结果真正转成下一轮提升，可以直接升级 Pro', body: '更深入的分析加上永久历史记录，更适合连续复盘和稳定提升。当前首发优惠价为 $2.99/月。' };
  })();

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
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
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

        <div className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">
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

          <div className="space-y-6 min-w-0">
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

            {showPersonalActions && (
              <ReviewActionBar
                review={review}
                showOwnerActions={showOwnerActions}
                showGuestHistoryLink={userInfo?.plan === 'guest'}
                linkCopied={linkCopied}
                actionBusy={actionBusy}
                favoriteCopy={favoriteCopy}
                onReplayReview={handleReplayReview}
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

            <div className="space-y-6 max-w-2xl">
              <CritiqueSection
                accent="text-sage" borderColor="border-sage" bgColor="bg-sage/5"
                icon={<ThumbsUp size={13} />} title={t('review_advantage')}
                body={displayAdvantage} isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust" borderColor="border-rust" bgColor="bg-rust/5"
                icon={<ThumbsDown size={13} />} title={t('review_critique')}
                body={displayCritique} isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-gold" borderColor="border-gold" bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />} title={t('review_suggestions')}
                body={displaySuggestions} showTags showFeedback isPro={isPro}
                highlightTop={2} highlightedId={highlightedCardId}
              />
            </div>

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
