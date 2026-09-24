'use client';

import Link from 'next/link';
import { ChevronDown, Download, Eye, EyeOff, FileText, ImageDown } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import type { ReviewGetResponse } from '@/lib/types';
import { getPracticeSession, getReview, isAbortError } from '@/lib/api';
import {
  buildReviewExportCardModel,
  buildReviewExportFileStem,
  compactExportSentence,
  type ReviewExportCardMode,
  getReviewExportCardCopy,
} from '@/features/reviews/helpers/reviewExportPresentation';
import { renderReviewExportCardPng } from '@/features/reviews/helpers/reviewExportCanvas';

interface ReviewExportPanelProps {
  review: ReviewGetResponse;
  defaultShowScore?: boolean;
}

export default function ReviewExportPanel({
  review,
  defaultShowScore = true,
}: ReviewExportPanelProps) {
  const { locale } = useI18n();
  const { ensureToken, token } = useAuth();
  const copy = useMemo(() => getReviewExportCardCopy(locale), [locale]);
  const [showScore, setShowScore] = useState(defaultShowScore);
  const [cardMode, setCardMode] = useState<ReviewExportCardMode>('single');
  const [title, setTitle] = useState(copy.cardTitle);
  const [summaryExcerpt, setSummaryExcerpt] = useState('');
  const [suggestionExcerpt, setSuggestionExcerpt] = useState('');
  const [targetExcerpt, setTargetExcerpt] = useState('');
  const [evidenceExcerpt, setEvidenceExcerpt] = useState('');
  const [frozenGoal, setFrozenGoal] = useState<string | null>(null);
  const [frozenGoalState, setFrozenGoalState] = useState<'idle' | 'loading' | 'available' | 'unavailable'>('idle');
  const [sourcePhotoUrl, setSourcePhotoUrl] = useState<string | null>(null);
  const [sourceState, setSourceState] = useState<'idle' | 'loading' | 'available' | 'unavailable'>('idle');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [excerptDirty, setExcerptDirty] = useState(false);
  const excerptDirtyRef = useRef(false);
  const previewKeyRef = useRef('');
  const previewUrlRef = useRef<string | null>(null);
  const previewRequestRef = useRef(0);
  const mountedRef = useRef(false);
  const sourceReviewId = review.practice
    ? review.practice.source_review_id
    : (review.source_review_id ?? review.result.comparison?.original_review_id ?? null);
  const sourceAccess = review.practice?.source_access ?? 'available';
  const sourceAllowed = Boolean(sourceReviewId && review.viewer_is_owner && (!sourceAccess || sourceAccess === 'available'));
  const practiceSessionId = review.practice?.session_id ?? null;
  const retakeAvailable = Boolean(review.result.comparison && sourcePhotoUrl && sourceState === 'available');

  useEffect(() => {
    setTitle(copy.cardTitle);
    const seedModel = buildReviewExportCardModel({ review, locale, title: copy.cardTitle });
    setSummaryExcerpt(seedModel.summary);
    setSuggestionExcerpt(seedModel.suggestion);
    setTargetExcerpt(seedModel.target ?? '');
    setEvidenceExcerpt(seedModel.evidenceLines.join('\n'));
    setExcerptDirty(false);
    excerptDirtyRef.current = false;
  }, [copy.cardTitle, locale, review]);

  useEffect(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setError('');
    previewRequestRef.current += 1;
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.review_id, showScore, cardMode, title, summaryExcerpt, suggestionExcerpt, targetExcerpt, evidenceExcerpt]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      previewRequestRef.current += 1;
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    setSourcePhotoUrl(null);
    setCardMode('single');
    if (!sourceAllowed || !sourceReviewId) {
      setSourceState(sourceReviewId ? 'unavailable' : 'idle');
      return;
    }
    const controller = new AbortController();
    setSourceState('loading');
    ensureToken()
      .then((authToken) => getReview(sourceReviewId, authToken, controller.signal))
      .then((sourceReview) => {
        if (controller.signal.aborted) return;
        if (sourceReview.photo_url) {
          setSourcePhotoUrl(sourceReview.photo_url);
          setSourceState('available');
        } else {
          setSourcePhotoUrl(null);
          setSourceState('unavailable');
        }
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setSourcePhotoUrl(null);
        setSourceState('unavailable');
      });
    return () => controller.abort();
  }, [ensureToken, sourceAllowed, sourceReviewId]);

  useEffect(() => {
    setFrozenGoal(null);
    if (!practiceSessionId || !review.viewer_is_owner) {
      setFrozenGoalState(practiceSessionId ? 'unavailable' : 'idle');
      return;
    }
    const controller = new AbortController();
    setFrozenGoalState('loading');
    ensureToken()
      .then((authToken) => getPracticeSession(practiceSessionId, authToken, controller.signal))
      .then((session) => {
        if (controller.signal.aborted) return;
        const goal = compactExportSentence(session.goal_snapshot?.goal);
        setFrozenGoal(goal || null);
        if (goal) {
          setTargetExcerpt((current) => (excerptDirtyRef.current || current ? current : goal));
        }
        setFrozenGoalState(goal ? 'available' : 'unavailable');
      })
      .catch((err) => {
        if (isAbortError(err) || controller.signal.aborted) return;
        setFrozenGoal(null);
        setFrozenGoalState('unavailable');
      });
    return () => controller.abort();
  }, [ensureToken, practiceSessionId, review.viewer_is_owner]);

  const model = useMemo(
    () => buildReviewExportCardModel({
      review,
      locale,
      showScore,
      title,
      summary: summaryExcerpt,
      suggestion: suggestionExcerpt,
      target: frozenGoal ?? null,
      evidenceLines: evidenceExcerpt.split('\n').map((line) => line.trim()).filter(Boolean),
      frozenGoal,
      excerptEdited: excerptDirty,
      mode: cardMode,
      sourceImageUrl: sourcePhotoUrl,
      sourceAvailable: retakeAvailable,
    }),
    [cardMode, evidenceExcerpt, excerptDirty, frozenGoal, locale, retakeAvailable, review, showScore, sourcePhotoUrl, suggestionExcerpt, summaryExcerpt, title],
  );

  const buildPreview = useCallback(async (download: boolean) => {
    const requestId = previewRequestRef.current + 1;
    previewRequestRef.current = requestId;
    setBusy(true);
    setError('');
    try {
      const authToken = token ?? await ensureToken();
      const result = await renderReviewExportCardPng(model, copy, { token: authToken });
      if (!mountedRef.current || previewRequestRef.current !== requestId) {
        URL.revokeObjectURL(result.url);
        return;
      }
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = result.url;
      setPreviewUrl(result.url);
      if (download) {
        const anchor = document.createElement('a');
        anchor.href = result.url;
        anchor.download = `${buildReviewExportFileStem({ createdAt: review.created_at, title })}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }
    } catch (err) {
      if (!mountedRef.current || previewRequestRef.current !== requestId) return;
      const message = err instanceof Error ? err.message : '';
      setError(message === copy.textTooLong || message === copy.imageMissing || message === copy.imageFailed ? message : copy.imageFailed);
    } finally {
      if (mountedRef.current && previewRequestRef.current === requestId) setBusy(false);
    }
  }, [copy, ensureToken, model, review.created_at, title, token]);

  useEffect(() => {
    if (!model.imageUrl) return;
    const previewKey = JSON.stringify({
      reviewId: model.reviewId,
      mode: model.mode,
      showScore: model.showScore,
      title: model.title,
      summary: model.summary,
      suggestion: model.suggestion,
      target: model.target,
      evidenceLines: model.evidenceLines,
      evidenceState: model.evidenceState,
      confidence: model.confidence,
      caveat: model.caveat,
      source: model.sourceImageUrl,
    });
    if (previewKeyRef.current === previewKey) return;
    previewKeyRef.current = previewKey;
    void buildPreview(false);
  }, [buildPreview, model]);

  const hasGoalFields = Boolean(model.target || model.evidenceLines.length > 0 || model.evidenceState !== 'unassessed' || review.practice || review.result.comparison);
  const canEditGoalEvidence = Boolean(model.target || model.evidenceLines.length > 0 || review.practice || review.result.comparison);

  return (
    <section className="ui-panel p-5" aria-labelledby="review-export-panel-title">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="ui-eyebrow">{copy.panelLabel}</p>
          <h2 id="review-export-panel-title" className="mt-2 text-xl font-semibold text-ink">{copy.panelTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.panelBody}</p>
          <p className="mt-2 text-xs leading-5 text-ink-subtle">{copy.privateNote}</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={() => void buildPreview(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-action px-4 py-2 text-sm font-semibold text-action-ink transition-colors hover:bg-action-hover disabled:opacity-60"
          >
            <Download size={15} aria-hidden="true" />
            {copy.downloadCard}
          </button>
          <Link
            href={`/reviews/${review.review_id}/print`}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-gold/35 hover:text-gold"
            prefetch={false}
          >
            <FileText size={15} aria-hidden="true" />
            {copy.printReport}
          </Link>
          <button
            type="button"
            onClick={() => setShowScore((value) => !value)}
            className="inline-flex min-h-10 items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-gold/35 hover:text-gold"
          >
            {showScore ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
            {showScore ? copy.hideScore : copy.showScore}
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(260px,0.52fr)_minmax(0,1fr)]">
        <div className="rounded-card border border-border-subtle bg-surface/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink">{copy.previewTitle}</p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void buildPreview(false)}
              className="inline-flex min-h-9 items-center gap-2 rounded-control border border-border px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-gold/35 hover:text-gold disabled:opacity-60"
            >
              <ImageDown size={14} aria-hidden="true" />
              {copy.loadPreview}
            </button>
          </div>
          <div className="mt-3 flex aspect-[4/5] items-center justify-center overflow-hidden rounded-control border border-border bg-raised">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Canvas object URL preview is local-only.
              <img src={previewUrl} alt={copy.previewTitle} className="h-full w-full object-contain" />
            ) : (
              <p className="px-6 text-center text-sm leading-6 text-ink-subtle">{busy ? copy.loadPreview : copy.previewTitle}</p>
            )}
          </div>
          {error && <p role="alert" className="mt-3 rounded-control border border-rust/25 bg-rust/5 px-3 py-2 text-sm text-rust">{error}</p>}
        </div>

        <div className="flex flex-col justify-between rounded-card border border-border-subtle bg-raised/55 p-4">
          <div className="space-y-3 text-sm leading-6 text-ink-muted">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{copy.singleCard}</p>
            <p className="text-lg font-semibold leading-7 text-ink">{model.summary}</p>
            {model.suggestion && <p>{model.suggestion}</p>}
            {hasGoalFields && (
              <div className="rounded-control border border-border-subtle bg-surface/55 px-3 py-2 text-xs leading-5 text-ink-subtle">
                {model.target && <p><span className="font-semibold text-ink-muted">{copy.target}: </span>{model.target}</p>}
                {model.evidenceState !== 'unassessed' && <p><span className="font-semibold text-ink-muted">{copy.evidence}: </span>{model.evidenceLabel}</p>}
                {model.caveat && <p>{model.caveat}</p>}
              </div>
            )}
            <p className="text-xs text-ink-subtle">{copy.quickCardNote}</p>
          </div>
          {!token && <p className="mt-3 text-xs text-ink-subtle">{copy.privateNote}</p>}
        </div>
      </div>

      <details
        className="group mt-4 overflow-hidden rounded-card border border-border-subtle bg-surface/55"
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden">
          <div>
            <p className="text-sm font-semibold text-ink">{copy.editExcerpts}</p>
            <p className="mt-1 text-xs leading-5 text-ink-subtle">{copy.fullReportNote}</p>
          </div>
          <ChevronDown size={16} className="shrink-0 text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>

        <div className="border-t border-border-subtle p-4">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.titleInput}</span>
              <input
                value={title}
                onChange={(event) => {
                  excerptDirtyRef.current = true;
                  setExcerptDirty(true);
                  setTitle(event.target.value.slice(0, 80));
                }}
                className="mt-2 min-h-11 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-gold/55"
              />
            </label>
            <fieldset className="min-w-64">
              <legend className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.exportMode}</legend>
              <div className="mt-2 flex rounded-control border border-border bg-raised p-1">
                {(['single', 'retake'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={mode === 'retake' && !retakeAvailable}
                    onClick={() => setCardMode(mode)}
                    aria-pressed={cardMode === mode}
                    className={`min-h-9 flex-1 rounded-[6px] px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      cardMode === mode ? 'bg-gold text-void' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {mode === 'single' ? copy.singleCard : copy.retakeCard}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          {review.result.comparison && !retakeAvailable && (
            <p className="mt-3 rounded-control border border-gold/25 bg-gold/5 px-3 py-2 text-xs leading-5 text-gold">
              {sourceState === 'loading' ? copy.includeSource : copy.sourceUnavailable}
            </p>
          )}

          <div className="mt-4 rounded-card border border-border-subtle bg-surface/65 p-4">
            <p className="text-xs leading-5 text-ink-subtle">{copy.excerptHelp}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-semibold text-ink-subtle">{copy.summaryInput}</span>
                <textarea
                  value={summaryExcerpt}
                  onChange={(event) => {
                    excerptDirtyRef.current = true;
                    setExcerptDirty(true);
                    setSummaryExcerpt(compactExportSentence(event.target.value));
                  }}
                  className="mt-1 min-h-24 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-gold/55"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-ink-subtle">{copy.suggestionInput}</span>
                <textarea
                  value={suggestionExcerpt}
                  onChange={(event) => {
                    excerptDirtyRef.current = true;
                    setExcerptDirty(true);
                    setSuggestionExcerpt(compactExportSentence(event.target.value));
                  }}
                  className="mt-1 min-h-24 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-gold/55"
                />
              </label>
              {canEditGoalEvidence && (
                <>
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-subtle">{copy.targetInput}</span>
                    <textarea
                      value={frozenGoalState === 'loading' ? copy.includeSource : (targetExcerpt || copy.noGoalShort)}
                      readOnly
                      className="mt-1 min-h-20 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm leading-6 text-ink-muted outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-ink-subtle">{copy.evidenceInput}</span>
                    <textarea
                      value={evidenceExcerpt}
                      onChange={(event) => {
                        excerptDirtyRef.current = true;
                        setExcerptDirty(true);
                        setEvidenceExcerpt(event.target.value.split('\n').map((line) => compactExportSentence(line)).join('\n'));
                      }}
                      className="mt-1 min-h-20 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-gold/55"
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        </div>
      </details>
    </section>
  );
}
