'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Minus, Sparkles, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatRetakeDelta } from '@/lib/retake-coach';
import type { RetakeDimensionKey, ReviewGetResponse } from '@/lib/types';

const DIMENSIONS: RetakeDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

function getCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'GPT-5.6 Terra Retake Coach', title: '元の写真と再撮影を比較', original: '元の写真', retake: '再撮影',
      before: 'Before', after: 'After', evidence: '見える根拠', remaining: '次の課題', actions: '次回の撮影アクション',
      success: '成功の目安', confidence: '比較の信頼度', notComparable: 'この2枚は直接比較しにくい可能性があります。',
      sourceLoading: '元の写真を読み込み中', sourceUnavailable: '元の写真は所有者だけが確認できます。',
      delta: { improved: '改善', declined: '低下', flat: '変化なし', unavailable: '比較不可' },
      dimensions: { composition: '構図', lighting: '光', color: '色', impact: '訴求力', technical: '技術' },
    };
  }
  if (locale === 'en') {
    return {
      label: 'GPT-5.6 Terra Retake Coach', title: 'Original vs. retake', original: 'Original', retake: 'Retake',
      before: 'Before', after: 'After', evidence: 'Visible evidence', remaining: 'Remaining gap', actions: 'Next-shoot actions',
      success: 'Success check', confidence: 'Comparison confidence', notComparable: 'These images may not be a reliable direct comparison.',
      sourceLoading: 'Loading original photo', sourceUnavailable: 'The original photo is available only to its owner.',
      delta: { improved: 'Improved', declined: 'Declined', flat: 'No change', unavailable: 'Not comparable' },
      dimensions: { composition: 'Composition', lighting: 'Lighting', color: 'Color', impact: 'Impact', technical: 'Technical' },
    };
  }
  return {
    label: 'GPT-5.6 Terra 重拍教练', title: '原片与重拍对比', original: '原片', retake: '重拍图',
    before: '重拍前', after: '重拍后', evidence: '画面依据', remaining: '仍需改善', actions: '下一次拍摄行动',
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
      <Icon size={12} aria-hidden="true" />{formatRetakeDelta(delta)}
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
    <section className="rounded-[28px] border border-sage/25 bg-[radial-gradient(circle_at_top_left,rgba(104,169,136,0.18),transparent_34%),rgb(var(--color-surface)/0.9)] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sage">{copy.label}</p>
          <h2 className="mt-2 font-display text-3xl text-ink">{copy.title}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink-muted">{comparison.summary}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-border-subtle bg-void/30 px-4 py-3">
          <div className="text-center"><p className="text-[10px] uppercase text-ink-subtle">{copy.before}</p><p className="font-display text-2xl">{comparison.overall_before.toFixed(1)}</p></div>
          <span className="text-ink-subtle">→</span>
          <div className="text-center"><p className="text-[10px] uppercase text-ink-subtle">{copy.after}</p><p className="font-display text-2xl">{comparison.overall_after.toFixed(1)}</p></div>
          <DeltaBadge delta={comparison.overall_delta} comparable={reliableComparison} labels={copy.delta} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-border-subtle bg-raised/70 px-3 py-1 text-ink-muted">{copy.confidence}: {comparison.comparison_confidence}</span>
        {!reliableComparison && <span className="rounded-full border border-rust/30 bg-rust/10 px-3 py-1 text-rust">{copy.notComparable}</span>}
      </div>
      {comparison.comparison_caveat && <p className="mt-3 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-sm leading-6 text-ink-muted">{comparison.comparison_caveat}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-xs font-medium text-ink-muted">{copy.original}</figcaption>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-raised">
            {source?.photo_url ? (
              <Image src={source.photo_url} alt={copy.original} fill className="object-contain" unoptimized />
            ) : (
              <div className={`flex h-full items-center justify-center px-6 text-center text-xs text-ink-subtle ${sourceState === 'loading' ? 'animate-pulse bg-border/30' : ''}`}>
                {sourceState === 'loading' ? copy.sourceLoading : copy.sourceUnavailable}
              </div>
            )}
          </div>
        </figure>
        <figure>
          <figcaption className="mb-2 text-xs font-medium text-ink-muted">{copy.retake}</figcaption>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-sage/30 bg-raised">
            {review.photo_url ? <Image src={review.photo_url} alt={copy.retake} fill className="object-contain" unoptimized /> : <div className="h-full bg-border/30" />}
          </div>
        </figure>
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {DIMENSIONS.map((key) => {
          const dimension = comparison.dimensions[key];
          return (
            <article key={key} className={`rounded-2xl border p-4 ${reliableComparison && dimension.delta > 0 && key === comparison.strongest_improvement ? 'border-sage/40 bg-sage/10' : 'border-border-subtle bg-raised/70'}`}>
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-ink">{copy.dimensions[key]}</h3>
                <DeltaBadge delta={dimension.delta} comparable={reliableComparison} labels={copy.delta} />
              </div>
              <div className="mt-3 flex items-baseline gap-2 text-sm text-ink-muted"><span>{dimension.before_score}</span><span>→</span><span className="font-display text-2xl text-ink">{dimension.after_score}</span></div>
              <p className="mt-3 text-[11px] uppercase tracking-wide text-ink-subtle">{copy.evidence}</p>
              <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-muted">{dimension.evidence.map((item, index) => <li key={`${key}-${index}`}>• {item}</li>)}</ul>
              {dimension.remaining_gap && <p className="mt-3 border-t border-border-subtle pt-3 text-xs leading-5 text-ink-subtle"><span className="font-medium text-ink-muted">{copy.remaining}: </span>{dimension.remaining_gap}</p>}
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-gold/25 bg-gold/5 p-5">
        <div className="flex items-center gap-2"><Target size={17} className="text-gold" /><h3 className="font-display text-2xl text-ink">{copy.actions}</h3></div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {comparison.next_actions.map((item, index) => (
            <div key={`${item.priority}-${item.dimension}-${index}`} className="rounded-xl border border-border-subtle bg-raised/80 p-4">
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
