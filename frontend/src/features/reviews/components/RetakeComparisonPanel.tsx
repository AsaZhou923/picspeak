'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Minus, Sparkles, Star, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { getPracticeSession, getReview, isAbortError, submitPracticeFeedback } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { usePracticeExposure } from '@/features/reviews/hooks/usePracticeExposure';
import { canContinuePractice } from '@/features/practice/journal';
import { getReviewExportCardCopy } from '@/features/reviews/helpers/reviewExportPresentation';
import { formatRetakeDelta } from '@/lib/retake-coach';
import type { GoalAssessmentStatus, PracticeFeedbackVote, PracticeKind, PracticeSessionResponse, RetakeDimensionKey, ReviewGetResponse } from '@/lib/types';

const DIMENSIONS: RetakeDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

function getCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'GPT-5.6 Retake Coach', title: '元の写真と再撮影を比較', original: '元の写真', retake: '再撮影',
      target: '撮影目標', compare: '変化を比較', targetLoading: '元の講評から撮影目標を読み込み中', targetUnavailable: '元の講評の目標を表示できません。',
      before: 'Before', after: 'After', evidence: '見える根拠', remaining: '次の課題', actions: '次回の撮影アクション',
      strongest: '最大の改善',
      success: '成功の目安', confidence: '比較の信頼度', notComparable: 'この2枚は直接比較しにくい可能性があります。',
      sourceLoading: '元の写真を読み込み中', sourceUnavailable: '元の写真は所有者だけが確認できます。',
      delta: { improved: '改善', declined: '低下', flat: '変化なし', unavailable: '比較不可' },
      goal: {
        achieved: '目標達成',
        partial: '一部達成',
        not_achieved: '未達成',
        indeterminate: '判定不能',
        evidence: '目標の根拠',
        limitations: '未解決点・制約',
        next: '次の一手',
        feedback: 'この判定は役に立ちましたか？',
        helpful: '役に立った',
        not_helpful: '役に立たない',
        incorrect: '判定が違う',
        saved: 'フィードバックを保存しました。',
        reason: '任意の理由',
        error: 'フィードバックを保存できませんでした。',
        continueSession: '同じ目標を続ける',
        nextGoal: '次の目標を作る',
        unavailable: '保存済みの目標判定はありません。',
      },
      dimensions: { composition: '構図', lighting: '光', color: '色', impact: '訴求力', technical: '技術' },
      editRevision: {
        label: 'GPT-5.6 Revision Coach',
        title: '変更前と変更後を比較',
        original: '変更前の写真',
        retake: '編集後の写真',
        target: '編集目標',
        compare: '変更前後を比較',
        before: '変更前',
        after: '変更後',
        actions: '次の編集アクション',
        notComparable: 'この2枚は編集前後として直接比較しにくい可能性があります。',
      },
    };
  }
  if (locale === 'en') {
    return {
      label: 'GPT-5.6 Retake Coach', title: 'Original vs. retake', original: 'Original', retake: 'Retake',
      target: 'Target', compare: 'Compare the change', targetLoading: 'Loading the shooting target from the original critique', targetUnavailable: 'The original shooting target is unavailable.',
      before: 'Before', after: 'After', evidence: 'Visible evidence', remaining: 'Remaining gap', actions: 'Next-shoot actions',
      strongest: 'Strongest improvement',
      success: 'Success check', confidence: 'Comparison confidence', notComparable: 'These images may not be a reliable direct comparison.',
      sourceLoading: 'Loading original photo', sourceUnavailable: 'The original photo is available only to its owner.',
      delta: { improved: 'Improved', declined: 'Declined', flat: 'No change', unavailable: 'Not comparable' },
      goal: {
        achieved: 'Goal achieved',
        partial: 'Partially achieved',
        not_achieved: 'Not achieved',
        indeterminate: 'Indeterminate',
        evidence: 'Goal evidence',
        limitations: 'Unresolved items / tradeoffs',
        next: 'Next action',
        feedback: 'Was this judgment useful?',
        helpful: 'Helpful',
        not_helpful: 'Not helpful',
        incorrect: 'Incorrect',
        saved: 'Feedback saved.',
        reason: 'Optional reason',
        error: 'Could not save feedback.',
        continueSession: 'Continue this goal',
        nextGoal: 'Create next goal',
        unavailable: 'No saved goal judgment is attached.',
      },
      dimensions: { composition: 'Composition', lighting: 'Lighting', color: 'Color', impact: 'Impact', technical: 'Technical' },
      editRevision: {
        label: 'GPT-5.6 Revision Coach',
        title: 'Before vs. edited version',
        original: 'Before edit',
        retake: 'Edited photo',
        target: 'Edit goal',
        compare: 'Compare before and after',
        before: 'Before edit',
        after: 'After edit',
        actions: 'Next edit actions',
        notComparable: 'These images may not be a reliable before-and-after edit comparison.',
      },
    };
  }
  return {
    label: 'GPT-5.6 重拍教练', title: '原片与重拍对比', original: '原片', retake: '重拍图',
    target: '拍摄目标', compare: '对比变化', targetLoading: '正在从原点评读取拍摄目标', targetUnavailable: '暂时无法显示原点评中的拍摄目标。',
    before: '重拍前', after: '重拍后', evidence: '画面依据', remaining: '仍需改善', actions: '下一次拍摄行动',
    strongest: '最大改善',
    success: '成功检查', confidence: '比较可信度', notComparable: '这两张照片可能不适合直接判断重拍进步。',
    sourceLoading: '正在加载原片', sourceUnavailable: '原片仅对作品所有者可见。',
    delta: { improved: '改善', declined: '下降', flat: '持平', unavailable: '不可比较' },
    goal: {
      achieved: '目标已完成',
      partial: '部分完成',
      not_achieved: '未完成',
      indeterminate: '无法判断',
      evidence: '目标证据',
      limitations: '未解决项 / 权衡',
      next: '下一步',
      feedback: '这个判断有帮助吗？',
      helpful: '有帮助',
      not_helpful: '帮助不大',
      incorrect: '判断不对',
      saved: '反馈已保存。',
      reason: '可选原因',
      error: '反馈保存失败。',
      continueSession: '继续这个目标',
      nextGoal: '创建下一目标',
      unavailable: '这次结果没有保存的目标判断。',
    },
    dimensions: { composition: '构图', lighting: '光线', color: '色彩', impact: '感染力', technical: '技术' },
    editRevision: {
      label: 'GPT-5.6 修图教练',
      title: '修改前后对比',
      original: '修改前照片',
      retake: '修改版照片',
      target: '修改目标',
      compare: '修改前后对比',
      before: '修改前',
      after: '修改后',
      actions: '下一次修改行动',
      notComparable: '这两张照片可能不适合直接判断修改前后的变化。',
    },
  };
}

function applyPracticeKindCopy(
  copy: ReturnType<typeof getCopy>,
  practiceKind: PracticeKind | null | undefined,
) {
  if (practiceKind !== 'edit_revision') return copy;
  return { ...copy, ...copy.editRevision };
}

function goalStatusTone(status: GoalAssessmentStatus): string {
  if (status === 'achieved') return 'border-sage/35 bg-sage/10 text-sage';
  if (status === 'partial') return 'border-gold/35 bg-gold/10 text-gold';
  if (status === 'not_achieved') return 'border-rust/35 bg-rust/10 text-rust';
  return 'border-border-subtle bg-raised text-ink-muted';
}

function DeltaBadge({
  delta,
  comparable = true,
  labels,
}: {
  delta: number;
  comparable?: boolean;
  labels: { improved: string; declined: string; flat: string; unavailable: string };
}) {
  if (!comparable) {
    return <span aria-label={labels.unavailable} className="inline-flex rounded-full border border-border bg-raised px-2.5 py-1 text-xs font-medium text-ink-muted">N/A</span>;
  }
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone = delta > 0 ? 'border-sage/30 bg-sage/10 text-sage' : delta < 0 ? 'border-rust/30 bg-rust/10 text-rust' : 'border-border bg-raised text-ink-muted';
  const direction = delta > 0 ? labels.improved : delta < 0 ? labels.declined : labels.flat;
  return (
    <span aria-label={`${direction}: ${formatRetakeDelta(delta)}`} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      <span>{direction}</span>
      <span>{formatRetakeDelta(delta)}</span>
    </span>
  );
}

export function RetakeComparisonPanel({ review, locale }: { review: ReviewGetResponse; locale: 'zh' | 'en' | 'ja' }) {
  const comparison = review.result.comparison;
  const resultExposureRef = usePracticeExposure('practice_result_viewed', review.practice?.attempt_id, locale, review.viewer_is_owner);
  const { ensureToken } = useAuth();
  const [source, setSource] = useState<ReviewGetResponse | null>(null);
  const [sourceState, setSourceState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const [practiceSession, setPracticeSession] = useState<PracticeSessionResponse | null>(null);
  const [practiceSessionState, setPracticeSessionState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const [feedbackState, setFeedbackState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [feedbackReason, setFeedbackReason] = useState('');
  const copy = useMemo(() => applyPracticeKindCopy(getCopy(locale), review.practice?.kind), [locale, review.practice?.kind]);
  const confidenceLevels = useMemo(() => getReviewExportCardCopy(locale).confidenceLevels, [locale]);
  const sourceReviewId = review.practice ? review.practice.source_review_id : comparison?.original_review_id;
  const sourceAvailable = !review.practice?.source_access || review.practice.source_access === 'available';

  useEffect(() => {
    setSource(null);
    if (!sourceReviewId || !sourceAvailable || !review.viewer_is_owner) {
      setSourceState('unavailable');
      return;
    }
    const controller = new AbortController();
    setSourceState('loading');
    ensureToken()
      .then((token) => getReview(sourceReviewId, token, controller.signal))
      .then((result) => {
        if (!controller.signal.aborted) {
          setSource(result);
          setSourceState('loaded');
        }
      })
      .catch((error) => {
        if (!isAbortError(error) && !controller.signal.aborted) {
          setSource(null);
          setSourceState('unavailable');
        }
      });
    return () => controller.abort();
  }, [sourceReviewId, sourceAvailable, ensureToken, review.viewer_is_owner]);

  useEffect(() => {
    const sessionId = review.practice?.session_id;
    setPracticeSession(null);
    if (!sessionId || !review.viewer_is_owner) {
      setPracticeSessionState('unavailable');
      return;
    }
    const controller = new AbortController();
    setPracticeSessionState('loading');
    ensureToken()
      .then((token) => getPracticeSession(sessionId, token, controller.signal))
      .then((session) => {
        if (!controller.signal.aborted) {
          setPracticeSession(session);
          setPracticeSessionState('loaded');
        }
      })
      .catch((error) => {
        if (!isAbortError(error) && !controller.signal.aborted) {
          setPracticeSession(null);
          setPracticeSessionState('unavailable');
        }
      });
    return () => controller.abort();
  }, [ensureToken, review.practice?.session_id, review.viewer_is_owner]);

  if (!comparison) return null;
  const reliableComparison = comparison.is_comparable && comparison.comparison_confidence !== 'low';
  const goalAssessment = review.goal_assessment ?? review.result.goal_assessment ?? comparison.goal_assessment ?? null;
  const feedbackAttemptId = review.practice?.attempt_id ?? null;

  async function handleFeedback(verdict: PracticeFeedbackVote) {
    if (!feedbackAttemptId || feedbackState === 'saving') return;
    setFeedbackState('saving');
    try {
      const token = await ensureToken();
      await submitPracticeFeedback(feedbackAttemptId, { verdict, reason: feedbackReason.trim() || null }, token);
      setFeedbackState('saved');
    } catch {
      setFeedbackState('error');
    }
  }

  return (
    <section className="ui-feature-panel p-5 sm:p-6">
      <p className="ui-eyebrow text-sage">{copy.label}</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">{copy.title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{comparison.summary}</p>

      {goalAssessment ? (
        <div ref={resultExposureRef} className="mt-6 rounded-card border border-border-subtle bg-surface/75 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${goalStatusTone(goalAssessment.status)}`}>
              {goalAssessment.status === 'indeterminate' ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              {copy.goal[goalAssessment.status]}
            </span>
          </div>

          {goalAssessment.evidence.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.goal.evidence}</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {goalAssessment.evidence.map((item, index) => (
                  <article key={`${item.success_criterion}-${index}`} className="rounded-control border border-border-subtle bg-raised/70 p-4">
                    <p className="text-sm font-semibold text-ink">{item.success_criterion}</p>
                    <p className="mt-2 text-xs leading-5 text-ink-muted">{item.before_observation}</p>
                    <p className="mt-2 text-xs leading-5 text-ink-muted">{item.after_observation}</p>
                    <p className="mt-3 border-t border-border-subtle pt-3 text-sm leading-6 text-ink">{item.conclusion}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {goalAssessment.limitations.length > 0 && (
            <div className="mt-4 rounded-control border border-gold/20 bg-gold/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{copy.goal.limitations}</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-muted">
                {goalAssessment.limitations.map((item, index) => <li key={`${item}-${index}`}>• {item}</li>)}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 rounded-control border border-border-subtle bg-raised/60 px-4 py-3 text-sm text-ink-muted">
          {copy.goal.unavailable}
        </p>
      )}

      <ol className="mt-6 grid gap-3 lg:grid-cols-4" aria-label={copy.title}>
        <li className="rounded-card border border-border-subtle bg-surface/75 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">01 · {copy.original}</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-control border border-border bg-raised">
            {source?.photo_url ? (
              <Image src={source.photo_url} alt={copy.original} fill className="object-contain" unoptimized />
            ) : (
              <div className={`flex h-full items-center justify-center px-4 text-center text-xs text-ink-subtle ${sourceState === 'loading' ? 'animate-pulse bg-border/30' : ''}`}>
                {sourceState === 'loading' ? copy.sourceLoading : copy.sourceUnavailable}
              </div>
            )}
          </div>
        </li>

        <li className="rounded-card border border-border-subtle bg-surface/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">02 · {copy.target}</p>
          <div className="mt-3 min-h-32 rounded-control border border-gold/25 bg-gold/5 p-4">
            {practiceSessionState === 'loading' ? (
              <p className="text-sm leading-6 text-ink-muted">{copy.targetLoading}</p>
            ) : practiceSession ? (
              <div>
                <p className="text-sm font-semibold leading-6 text-ink">{practiceSession.goal_snapshot.goal}</p>
                {practiceSession.success_criteria.length > 0 && (
                  <ul className="mt-3 space-y-1.5 text-xs leading-5 text-ink-muted">
                    {practiceSession.success_criteria.slice(0, 5).map((criterion) => (
                      <li key={criterion.key}>• {criterion.label}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <p className="text-sm leading-6 text-ink-muted">{copy.targetUnavailable}</p>
            )}
          </div>
        </li>

        <li className="rounded-card border border-border-subtle bg-surface/75 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">03 · {copy.retake}</p>
          <div className="relative aspect-[4/3] overflow-hidden rounded-control border border-border bg-raised">
            {review.photo_url ? <Image src={review.photo_url} alt={copy.retake} fill className="object-contain" unoptimized /> : <div className="h-full bg-border/30" />}
          </div>
        </li>

        <li className="rounded-card border border-border-subtle bg-surface/75 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">04 · {copy.compare}</p>
          <div className="mt-3 space-y-4 rounded-control border border-border-subtle bg-raised/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-center"><p className="text-[10px] uppercase text-ink-subtle">{copy.before}</p><p className="text-2xl font-semibold text-ink">{comparison.overall_before.toFixed(1)}</p></div>
              <span className="text-ink-subtle" aria-hidden="true">→</span>
              <div className="text-center"><p className="text-[10px] uppercase text-ink-subtle">{copy.after}</p><p className="text-2xl font-semibold text-ink">{comparison.overall_after.toFixed(1)}</p></div>
            </div>
            <DeltaBadge delta={comparison.overall_delta} comparable={reliableComparison} labels={copy.delta} />
          </div>
        </li>
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border-subtle bg-raised/70 px-3 py-1.5 text-ink-muted">{copy.confidence}: {confidenceLevels[comparison.comparison_confidence]}</span>
        {!reliableComparison && <span className="rounded-full border border-rust/30 bg-rust/10 px-3 py-1.5 font-medium text-rust">{copy.notComparable}</span>}
      </div>
      {comparison.comparison_caveat && <p className="mt-3 rounded-control border border-gold/20 bg-gold/5 px-4 py-3 text-sm leading-6 text-ink-muted">{comparison.comparison_caveat}</p>}

      <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {DIMENSIONS.map((key) => {
          const dimension = comparison.dimensions[key];
          return (
            <article key={key} className={`rounded-card border p-4 ${reliableComparison && dimension.delta > 0 && key === comparison.strongest_improvement ? 'border-sage/40 bg-sage/10' : 'border-border-subtle bg-raised/70'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-ink">{copy.dimensions[key]}</h3>
                <DeltaBadge delta={dimension.delta} comparable={reliableComparison} labels={copy.delta} />
              </div>
              {reliableComparison && dimension.delta > 0 && key === comparison.strongest_improvement && (
                <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-sage">
                  <Star size={12} aria-hidden="true" />{copy.strongest}
                </p>
              )}
              <div className="mt-3 flex items-baseline gap-2 text-sm text-ink-muted"><span>{dimension.before_score}</span><span>→</span><span className="font-display text-2xl text-ink">{dimension.after_score}</span></div>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-subtle">{copy.evidence}</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-muted">{dimension.evidence.map((item, index) => <li key={`${key}-${index}`}>• {item}</li>)}</ul>
              {dimension.remaining_gap && <p className="mt-3 border-t border-border-subtle pt-3 text-xs leading-5 text-ink-subtle"><span className="font-medium text-ink-muted">{copy.remaining}: </span>{dimension.remaining_gap}</p>}
            </article>
          );
        })}
      </div>

      {(feedbackAttemptId || goalAssessment) && (
        <div className="mt-6 rounded-card border border-border-subtle bg-surface/75 p-5">
          {feedbackAttemptId && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.goal.feedback}</p>
              <textarea
                value={feedbackReason}
                onChange={(event) => setFeedbackReason(event.target.value.slice(0, 1000))}
                placeholder={copy.goal.reason}
                className="mt-3 min-h-20 w-full rounded-control border border-border bg-raised px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-gold/55"
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {(['helpful', 'not_helpful', 'incorrect'] as const).map((verdict) => (
                  <button
                    key={verdict}
                    type="button"
                    disabled={feedbackState === 'saving'}
                    onClick={() => void handleFeedback(verdict)}
                    className="min-h-10 rounded-control border border-border-subtle px-3 py-1.5 text-xs font-semibold text-ink-muted transition-colors hover:border-gold/30 hover:text-ink disabled:opacity-60"
                  >
                    {copy.goal[verdict]}
                  </button>
                ))}
                {feedbackState === 'saved' && <span className="text-xs text-sage">{copy.goal.saved}</span>}
                {feedbackState === 'error' && <span className="text-xs text-rust">{copy.goal.error}</span>}
              </div>
            </div>
          )}

          {goalAssessment && (
            <div className={feedbackAttemptId ? 'mt-5 border-t border-border-subtle pt-5' : ''}>
              <p className="text-sm leading-6 text-ink-muted">
                <span className="font-semibold text-ink">{copy.goal.next}: </span>{goalAssessment.next_action}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {review.practice?.session_id && practiceSession && canContinuePractice(practiceSession) && (
                  <Link
                    href={`/workspace?practice_session_id=${encodeURIComponent(review.practice.session_id)}`}
                    className="inline-flex min-h-11 items-center rounded-control border border-gold/30 px-4 py-2 text-sm font-semibold text-gold transition-colors hover:bg-gold/10"
                  >
                    {copy.goal.continueSession}
                  </Link>
                )}
                <Link
                  href={`/workspace?${new URLSearchParams({
                    source_review_id: review.review_id,
                    retake_intent: 'new_photo_retake',
                    next_shoot_action: goalAssessment.next_action,
                    next_shoot_dimension: practiceSession?.goal_snapshot.dimension ?? 'composition',
                    practice_kind: 'capture_retake',
                    mode: review.mode,
                    image_type: review.image_type,
                  }).toString()}`}
                  className="inline-flex min-h-11 items-center rounded-control bg-action px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-action-hover"
                >
                  {copy.goal.nextGoal}
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-6 rounded-card border border-gold/25 bg-gold/5 p-5">
        <div className="flex items-center gap-2"><Target size={17} className="text-gold" /><h3 className="text-2xl font-semibold text-ink">{copy.actions}</h3></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {comparison.next_actions.map((item, index) => (
            <div key={`${item.priority}-${item.dimension}-${index}`} className="rounded-control border border-border-subtle bg-raised/80 p-4">
              <div className="flex items-center gap-2 text-xs text-gold"><Sparkles size={13} /><span>#{item.priority} · {copy.dimensions[item.dimension]}</span></div>
              <p className="mt-2 text-sm leading-6 text-ink">{item.action}</p>
              <p className="mt-3 flex gap-2 text-xs leading-5 text-ink-muted"><CheckCircle2 size={14} className="mt-0.5 shrink-0 text-sage" /><span><strong>{copy.success}:</strong> {item.success_check}</span></p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
