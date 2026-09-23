'use client';

import Link from 'next/link';
import { AlertCircle, ArrowLeft, Download, Printer } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { exportReview, getPracticeSession, getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import type { ReviewExportResponse, ReviewGetResponse, ReviewScores } from '@/lib/types';
import {
  buildReviewExportCardModel,
  buildReviewPrintMarkdown,
  getReviewExportCardCopy,
} from '@/features/reviews/helpers/reviewExportPresentation';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';

export default function ReviewPrintPage() {
  const params = useParams();
  const reviewId = params.reviewId as string;
  const { ensureToken } = useAuth();
  const { locale, t } = useI18n();
  const copy = useMemo(() => getReviewExportCardCopy(locale), [locale]);
  const [payload, setPayload] = useState<ReviewExportResponse | null>(null);
  const [reviewDetail, setReviewDetail] = useState<ReviewGetResponse | null>(null);
  const [sourceReview, setSourceReview] = useState<ReviewGetResponse | null>(null);
  const [sourceState, setSourceState] = useState<'idle' | 'loading' | 'available' | 'unavailable'>('idle');
  const [frozenGoal, setFrozenGoal] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    ensureToken()
      .then(async (token) => {
        const [result, detail] = await Promise.all([
          exportReview(reviewId, token),
          getReview(reviewId, token),
        ]);
        if (!cancelled) setReviewDetail(detail);
        if (detail.practice?.session_id && detail.viewer_is_owner) {
          try {
            const session = await getPracticeSession(detail.practice.session_id, token);
            if (!cancelled) setFrozenGoal(session.goal_snapshot?.goal?.trim() || null);
          } catch (err) {
            if (!isAbortError(err) && !cancelled) setFrozenGoal(null);
          }
        } else if (!cancelled) {
          setFrozenGoal(null);
        }
        const sourceReviewId = detail.practice
          ? detail.practice.source_review_id
          : (detail.source_review_id ?? detail.result.comparison?.original_review_id ?? result.review.source_review_id);
        const sourceAccess = detail.practice?.source_access ?? 'available';
        if (sourceReviewId && detail.viewer_is_owner && (!sourceAccess || sourceAccess === 'available')) {
          setSourceState('loading');
          try {
            const source = await getReview(sourceReviewId, token);
            if (!cancelled) {
              setSourceReview(source.photo_url && source.viewer_is_owner ? source : null);
              setSourceState(source.photo_url && source.viewer_is_owner ? 'available' : 'unavailable');
            }
          } catch (err) {
            if (!isAbortError(err) && !cancelled) {
              setSourceReview(null);
              setSourceState('unavailable');
            }
          }
        } else if (!cancelled) {
          setSourceReview(null);
          setSourceState('idle');
        }
        return result;
      })
      .then((result) => {
        if (cancelled) return;
        setPayload(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(formatUserFacingError(t, err, t('review_err_fetch')));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ensureToken, reviewId, t]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10">
        <SkeletonBlock className="mb-6 h-8 w-56" />
        <SkeletonBlock className="h-[720px] w-full rounded-card" />
      </div>
    );
  }

  if (error || !payload) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="space-y-4 text-center">
          <AlertCircle size={40} className="mx-auto text-rust" aria-hidden="true" />
          <p className="text-sm text-rust">{error || t('review_err_fetch')}</p>
          <Link href={`/reviews/${reviewId}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-4 py-2 text-sm text-ink-muted">
            <ArrowLeft size={14} aria-hidden="true" />
            {copy.back}
          </Link>
        </div>
      </div>
    );
  }

  const exportPayload = payload;
  const model = buildReviewExportCardModel({ review: reviewDetail ?? exportPayload, locale, frozenGoal });
  const markdown = buildReviewPrintMarkdown({ payload: exportPayload, locale, copy });
  const hasPhoto = Boolean(exportPayload.photo.photo_url || exportPayload.photo.photo_thumbnail_url);
  const lowConfidence = model.comparison?.comparison_confidence === 'low' || model.evidenceState === 'indeterminate';
  const negativeResult = model.evidenceState === 'not_achieved';
  const scoreEntries = Object.entries(exportPayload.review.scores) as Array<[keyof ReviewScores, number]>;

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `picspeak-report-${exportPayload.review.review_id.slice(0, 8)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 print:max-w-none print:px-0 print:py-0">
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          body { color: #191713; }
          a[href]::after { content: ""; }
        }
      `}</style>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/reviews/${reviewId}`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-gold">
          <ArrowLeft size={14} aria-hidden="true" />
          {copy.back}
        </Link>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadMarkdown}
            className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-gold/35 hover:text-gold"
          >
            <Download size={15} aria-hidden="true" />
            {copy.downloadMarkdown}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-control bg-action px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-action-hover"
          >
            <Printer size={15} aria-hidden="true" />
            {copy.print}
          </button>
        </div>
      </div>

      <article className="rounded-card border border-border-subtle bg-surface p-8 shadow-level-1 print:break-after-page print:rounded-none print:border-0 print:bg-white print:p-10 print:shadow-none">
        <header className="border-b border-border-subtle pb-5">
          <p className="ui-eyebrow">PicSpeak</p>
          <h1 className="mt-2 text-3xl font-semibold text-ink">{copy.panelTitle}</h1>
          <p className="mt-2 text-sm text-ink-muted">{copy.createdAt}: {new Date(exportPayload.review.created_at).toLocaleString(locale)}</p>
        </header>

        <div className="mt-6 grid gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-control border border-border bg-raised">
            {hasPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- Print keeps authorized export payload URLs unchanged.
              <img
                src={exportPayload.photo.photo_url ?? exportPayload.photo.photo_thumbnail_url ?? ''}
                alt={copy.after}
                className="h-auto max-h-[420px] w-full object-contain"
              />
            ) : (
              <div className="flex h-64 items-center justify-center px-4 text-center text-sm text-ink-subtle">
                {copy.imageMissing}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-control border border-border-subtle bg-raised/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.evidence}</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{model.evidenceLabel}</p>
              {lowConfidence && <p className="mt-2 text-sm leading-6 text-gold">{model.caveat || copy.noGoal}</p>}
              {negativeResult && <p className="mt-2 text-sm leading-6 text-rust">{model.summary}</p>}
            </div>
            <section>
              <h2 className="text-lg font-semibold text-ink">{locale === 'zh' ? '点评摘要' : locale === 'ja' ? '講評の要約' : 'Summary'}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{model.summary}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink">{copy.target}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{model.target ?? copy.noFrozenGoal}</p>
            </section>
            <section>
              <h2 className="text-lg font-semibold text-ink">{copy.suggestionInput}</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-muted">{model.suggestion}</p>
            </section>
          </div>
        </div>
      </article>

      <article className="mt-6 rounded-card border border-border-subtle bg-surface p-8 shadow-level-1 print:mt-0 print:break-before-page print:rounded-none print:border-0 print:bg-white print:p-10 print:shadow-none">
        <h2 className="text-2xl font-semibold text-ink">{model.comparison ? copy.retakeCard : copy.scoreContext}</h2>

        {model.comparison ? (
          <div className="mt-5 space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <figure className="rounded-control border border-border bg-raised p-3">
                {sourceReview?.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Print keeps authorized owner image URL unchanged.
                  <img src={sourceReview.photo_url} alt={copy.before} className="h-auto max-h-72 w-full object-contain" />
                ) : (
                  <div className="flex h-56 items-center justify-center px-4 text-center text-sm text-ink-subtle">
                    {sourceState === 'loading' ? copy.includeSource : copy.sourceUnavailable}
                  </div>
                )}
                <figcaption className="mt-2 text-xs font-semibold text-ink-subtle">{copy.before}</figcaption>
              </figure>
              <figure className="rounded-control border border-border bg-raised p-3">
                {hasPhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Print keeps authorized export payload URLs unchanged.
                  <img src={exportPayload.photo.photo_url ?? exportPayload.photo.photo_thumbnail_url ?? ''} alt={copy.after} className="h-auto max-h-72 w-full object-contain" />
                ) : (
                  <div className="flex h-56 items-center justify-center px-4 text-center text-sm text-ink-subtle">{copy.imageMissing}</div>
                )}
                <figcaption className="mt-2 text-xs font-semibold text-ink-subtle">{copy.after}</figcaption>
              </figure>
            </div>

            <section className="rounded-control border border-border-subtle bg-raised/70 p-4">
              <h3 className="text-lg font-semibold text-ink">{copy.confidence}: {model.confidence ? (copy.confidenceLevels[model.confidence as keyof typeof copy.confidenceLevels] || model.confidence) : '-'}</h3>
              <p className="mt-2 text-sm leading-7 text-ink-muted">{model.caveat || model.summary}</p>
            </section>

            <div className="grid gap-3 md:grid-cols-2">
              {scoreEntries.map(([key, value]) => {
                const dimension = model.comparison?.dimensions[key];
                return (
                  <section key={key} className="rounded-control border border-border-subtle bg-raised/70 p-4">
                    <h3 className="text-sm font-semibold text-ink">{copy.dimensions[key]}</h3>
                    <p className="mt-2 text-sm text-ink-muted">
                      {dimension
                        ? `${dimension.before_score.toFixed(1)} -> ${dimension.after_score.toFixed(1)} (${dimension.delta >= 0 ? '+' : ''}${dimension.delta.toFixed(1)})`
                        : value.toFixed(1)}
                    </p>
                    {dimension?.evidence?.length ? (
                      <ul className="mt-2 space-y-1 text-xs leading-5 text-ink-muted">
                        {dimension.evidence.slice(0, 3).map((item, index) => <li key={`${key}-${index}`}>• {item}</li>)}
                      </ul>
                    ) : null}
                  </section>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {scoreEntries.map(([key, value]) => (
              <section key={key} className="rounded-control border border-border-subtle bg-raised/70 p-4">
                <h3 className="text-sm font-semibold text-ink">{copy.dimensions[key]}</h3>
                <p className="mt-2 text-2xl font-semibold text-ink">{value.toFixed(1)}</p>
              </section>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
