'use client';

import { useEffect, useRef, useState } from 'react';
import { SignInButton } from '@clerk/nextjs';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { isDemoReviewId } from '@/lib/demo-review';
import { ApiException, type ReviewGetResponse } from '@/lib/types';
import { deleteScoreFeedback, getReview, getScoreFeedback, getScoreFeedbackRecord, isAbortError, putScoreFeedback } from '@/lib/api';
import { withdrawScoreFeedback, type ScoreFeedback, type ScoreFeedbackVerdict } from '@/lib/score-feedback';

interface Props {
  review: ReviewGetResponse;
  sourceSurface: 'result' | 'gallery';
  onReviewRefresh: (review: ReviewGetResponse | null, feedback?: ScoreFeedback | null) => void;
}

export function ScoreFeedbackPanel(props: Props) {
  const { token, userInfo, isLoading } = useAuth();
  // Remount synchronously on identity change: never paint the previous account's choice.
  const identity = !isLoading && token && userInfo && userInfo.plan !== 'guest' ? `${userInfo.user_id}:${token}` : null;
  if (isDemoReviewId(props.review.review_id) || props.review.result.comparison || props.review.practice || !props.review.score_revision) return null;
  // The server supplies a revision only for owner access or an approved Gallery work.
  // Gallery management fields are intentionally hidden from non-owners.
  return <FeedbackSession key={`${identity}:${props.review.review_id}:${props.review.score_revision}`} {...props} token={identity ? token : null} authLoading={isLoading} />;
}

function FeedbackSession({ review, sourceSurface, onReviewRefresh, token, authLoading }: Props & { token: string | null; authLoading: boolean }) {
  const { t } = useI18n();
  const [feedback, setFeedback] = useState<ScoreFeedback | null>(null);
  const [draft, setDraft] = useState<ScoreFeedbackVerdict | null>(null);
  const [editing, setEditing] = useState(false);
  const [eligible, setEligible] = useState(false);
  const [busy, setBusy] = useState(Boolean(token));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [retry, setRetry] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);
  const revision = review.score_revision!;

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (token) {
      setBusy(true);
      void getScoreFeedback(review.review_id, revision, token, controller.signal).then((data) => {
        if (controller.signal.aborted) return;
        setEligible(data.eligible);
        setFeedback(data.my_feedback);
        setError(data.eligible ? '' : t('score_feedback_unavailable'));
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted && !isAbortError(failure)) void handleFailure(failure, controller.signal);
      }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    }
    return () => controller.abort();
    // The identity/revision key owns this session; retries only reload its personal state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, review.review_id, revision, retry, t]);

  async function handleFailure(failure: unknown, signal: AbortSignal) {
    if (signal.aborted || !token) return;
    if (failure instanceof ApiException) {
      if (failure.status === 401) {
        setUnauthorized(true); setFeedback(null); setDraft(null); setEligible(false);
        setError(t('score_feedback_login')); return;
      }
      if (failure.code === 'SCORE_FEEDBACK_SCORE_CHANGED') {
        setEligible(false); setFeedback(null); setDraft(null);
        setNotice(t('score_feedback_score_changed')); setError('');
        try {
          const latest = await getReview(review.review_id, token, signal);
          if (!signal.aborted) onReviewRefresh(latest);
        } catch (refreshFailure) {
          if (signal.aborted) return;
          if (refreshFailure instanceof ApiException && [403, 404].includes(refreshFailure.status)) onReviewRefresh(null, feedback);
          else setError(t('score_feedback_refresh_failed'));
        }
        return;
      }
      if ([403, 404].includes(failure.status)) {
        setEligible(false); setDraft(null); onReviewRefresh(null, feedback); return;
      }
      if (failure.status === 409) {
        setEligible(false); setError(t('score_feedback_version_changed')); return;
      }
      if (failure.status === 429) { setError(t('score_feedback_rate_limit')); return; }
    }
    setError(t('score_feedback_failed'));
  }

  async function save(verdict: ScoreFeedbackVerdict) {
    const controller = lifetime.current;
    if (!token || !eligible || unauthorized || mutationBusy.current || !controller || controller.signal.aborted) return;
    mutationBusy.current = true; setBusy(true); setDraft(verdict); setError(''); setNotice('');
    try {
      const saved = await putScoreFeedback(review.review_id, { expected_score_revision: revision, verdict, expected_feedback_version: feedback?.feedback_version ?? null, source_surface: sourceSurface }, token, controller.signal);
      if (!controller.signal.aborted) { setFeedback(saved); setDraft(null); setEditing(false); setNotice(t('score_feedback_saved')); }
    } catch (failure) {
      if (!controller.signal.aborted && !isAbortError(failure)) await handleFailure(failure, controller.signal);
    } finally {
      mutationBusy.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function withdraw() {
    const controller = lifetime.current;
    if (!token || !feedback || unauthorized || mutationBusy.current || !controller || controller.signal.aborted) return;
    mutationBusy.current = true; setBusy(true); setError(''); setNotice('');
    try {
      await withdrawScoreFeedback(feedback,
        (id, version) => deleteScoreFeedback(id, version, token, controller.signal),
        (id) => getScoreFeedbackRecord(id, token, controller.signal));
      if (!controller.signal.aborted) { setFeedback(null); setDraft(null); setEditing(false); setNotice(t('score_feedback_withdrawn')); setRetry((value) => value + 1); }
    } catch (failure) {
      if (!controller.signal.aborted && !isAbortError(failure)) await handleFailure(failure, controller.signal);
    } finally {
      mutationBusy.current = false;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const verdicts = ['accurate', 'too_high', 'too_low'] as const;
  const active = feedback?.state === 'active';
  const loginRequired = !token || unauthorized;
  return (
    <div className="mt-4 border-t border-border-subtle pt-4" aria-labelledby="score-feedback-title" aria-busy={busy}>
      <h3 id="score-feedback-title" className="text-sm font-medium text-ink">{t('score_feedback_title')}</h3>
      <p className="mt-2 text-xs leading-5 text-ink-muted">{t('score_feedback_hint')}</p>
      {authLoading ? <p className="mt-3 text-xs text-ink-muted" role="status">{t('score_feedback_loading')}</p> : loginRequired ? (
        <SignInButton mode="modal" forceRedirectUrl={`/reviews/${review.review_id}`}>
          <button type="button" className="mt-3 min-h-11 rounded-control border border-border-subtle px-3 text-sm text-ink">{t('score_feedback_login')}</button>
        </SignInButton>
      ) : active && !editing ? (
        <div className="mt-3">
          <p className="text-sm text-ink">{t('score_feedback_yours')}: {t(`score_feedback_${feedback.verdict}`)}</p>
          <div className="mt-1 flex flex-wrap gap-3">
            <button type="button" disabled={busy || !eligible} onClick={() => { setEditing(true); setDraft(feedback.verdict); }} className="min-h-11 text-xs text-ink-muted disabled:opacity-50">{t('score_feedback_modify')}</button>
            <button type="button" disabled={busy} onClick={() => void withdraw()} className="min-h-11 text-xs text-ink-muted disabled:opacity-50">{t('score_feedback_withdraw')}</button>
          </div>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label={t('score_feedback_title')}>
          {verdicts.map((verdict) => <button key={verdict} type="button" aria-pressed={draft === verdict} disabled={busy || !eligible} onClick={() => void save(verdict)} className={`min-h-11 rounded-control border px-2 py-2 text-xs disabled:opacity-50 ${draft === verdict ? 'border-ink bg-raised font-semibold text-ink' : 'border-border-subtle text-ink-muted hover:bg-raised'}`}>{t(`score_feedback_${verdict}`)}</button>)}
        </div>
      )}
      {busy && <p role="status" className="mt-2 text-xs text-ink-muted">{t(mutationBusy.current ? 'score_feedback_saving' : 'score_feedback_loading')}</p>}
      {notice && <p role="status" className="mt-2 text-xs text-ink-muted">{notice}</p>}
      {error && <div className="mt-2 text-xs text-ink-muted"><p role="alert">{error}</p>{!loginRequired && <button type="button" disabled={busy} className="min-h-11 underline" onClick={() => { setError(''); if (eligible && draft) void save(draft); else setRetry((value) => value + 1); }}>{t('score_feedback_retry')}</button>}</div>}
      <p className="mt-2 text-xs leading-5 text-ink-subtle">{t('score_feedback_private')}</p>
    </div>
  );
}

// Keep only personal metadata after access to the critique is lost.
export function ScoreFeedbackWithdrawal({ feedback, ownerId }: { feedback: ScoreFeedback; ownerId: string }) {
  const { token, userInfo, isLoading } = useAuth();
  if (isLoading || !token || userInfo?.user_id !== ownerId || userInfo.plan === 'guest') return null;
  return <WithdrawalSession key={`${ownerId}:${token}`} feedback={feedback} token={token} />;
}

function WithdrawalSession({ feedback, token }: { feedback: ScoreFeedback; token: string }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'failed' | 'unauthorized'>('idle');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    controller.current = new AbortController();
    return () => controller.current?.abort();
  }, []);
  async function withdraw() {
    const signal = controller.current?.signal;
    if (!signal || signal.aborted || status === 'busy') return;
    setStatus('busy');
    try {
      await withdrawScoreFeedback(feedback, (id, version) => deleteScoreFeedback(id, version, token, signal), (id) => getScoreFeedbackRecord(id, token, signal));
      if (!signal.aborted) setStatus('done');
    } catch (failure) {
      if (!signal.aborted) setStatus(failure instanceof ApiException && failure.status === 401 ? 'unauthorized' : 'failed');
    }
  }
  return <div className="mt-4 text-sm text-ink-muted">
    {status === 'done' ? <p role="status">{t('score_feedback_withdrawn')}</p> : <>
      <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={status === 'busy' || status === 'unauthorized'} onClick={() => void withdraw()}>{t('score_feedback_withdraw')}</button>
      {status === 'busy' && <p role="status">{t('score_feedback_saving')}</p>}
      {status === 'failed' && <p role="alert">{t('score_feedback_failed')}</p>}
      {status === 'unauthorized' && <p role="alert">{t('score_feedback_login')}</p>}
    </>}
  </div>;
}
