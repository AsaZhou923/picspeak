'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Minus, Sparkles, Star, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRetakeDelta } from '@/lib/retake-coach';
import type { RetakeDimensionKey, ReviewGetResponse } from '@/lib/types';

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
      dimensions: { composition: '構図', lighting: '光', color: '色', impact: '訴求力', technical: '技術' },
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
      dimensions: { composition: 'Composition', lighting: 'Lighting', color: 'Color', impact: 'Impact', technical: 'Technical' },
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
    dimensions: { composition: '构图', lighting: '光线', color: '色彩', impact: '感染力', technical: '技术' },
  };
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
  const { ensureToken } = useAuth();
  const [source, setSource] = useState<ReviewGetResponse | null>(null);
  const [sourceState, setSourceState] = useState<'idle' | 'loading' | 'loaded' | 'unavailable'>('idle');
  const copy = useMemo(() => getCopy(locale), [locale]);

  useEffect(() => {
    if (!comparison?.original_review_id || !review.viewer_is_owner) {
      setSourceState('unavailable');
      return;
    }
    const controller = new AbortController();
    setSourceState('loading');
    ensureToken()
      .then((token) => getReview(comparison.original_review_id, token, controller.signal))
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
  }, [comparison?.original_review_id, ensureToken, review.viewer_is_owner]);

  if (!comparison) return null;
  const reliableComparison = comparison.is_comparable && comparison.comparison_confidence !== 'low';

  return (
    <section className="ui-feature-panel p-5 sm:p-6">
      <p className="ui-eyebrow text-sage">{copy.label}</p>
      <h2 className="mt-2 text-3xl font-semibold text-ink">{copy.title}</h2>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{comparison.summary}</p>

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
          <div className="mt-3 flex min-h-32 items-center rounded-control border border-gold/25 bg-gold/5 p-4">
            <p className="text-sm leading-6 text-ink-muted">
              {sourceState === 'loading'
                ? copy.targetLoading
                : source?.result.suggestions || copy.targetUnavailable}
            </p>
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
        <span className="rounded-full border border-border-subtle bg-raised/70 px-3 py-1.5 text-ink-muted">{copy.confidence}: {comparison.comparison_confidence}</span>
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
