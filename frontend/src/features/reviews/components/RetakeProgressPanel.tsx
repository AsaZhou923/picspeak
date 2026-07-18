'use client';

import Link from 'next/link';
import { ArrowUpRight, Camera, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { latestRetakeChain } from '@/lib/retake-progress';
import type { RetakeDimensionKey, ReviewHistoryItem } from '@/lib/types';

const DIMENSIONS: RetakeDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

function getCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Retake Progress', title: '再撮影チェーンの成長曲線', body: '同じ撮影課題を繰り返した結果だけをつないで表示します。',
      empty: '比較可能な再撮影がまだありません。', latest: '最新の変化', open: '比較を見る', original: 'Original', retake: 'Retake',
      trend: { improved: '改善', declined: '低下', flat: '変化なし' },
      dimensions: { composition: '構図', lighting: '光', color: '色', impact: '訴求力', technical: '技術' },
    };
  }
  if (locale === 'en') {
    return {
      label: 'Retake Progress', title: 'Progress across one retake chain', body: 'This curve connects only paired attempts from the same photographic exercise.',
      empty: 'No comparable retake chain yet.', latest: 'Latest change', open: 'Open comparison', original: 'Original', retake: 'Retake',
      trend: { improved: 'Improved', declined: 'Declined', flat: 'No change' },
      dimensions: { composition: 'Composition', lighting: 'Lighting', color: 'Color', impact: 'Impact', technical: 'Technical' },
    };
  }
  return {
    label: '重拍进步', title: '同一重拍链的成长曲线', body: '这里只连接同一个拍摄练习中的成对结果，不混入无关照片的平均分。',
    empty: '还没有可比较的重拍记录。', latest: '最近一次变化', open: '查看对比', original: '原片', retake: '重拍',
    trend: { improved: '改善', declined: '下降', flat: '持平' },
    dimensions: { composition: '构图', lighting: '光线', color: '色彩', impact: '感染力', technical: '技术' },
  };
}

export function RetakeProgressPanel({ items, locale }: { items: ReviewHistoryItem[]; locale: 'zh' | 'en' | 'ja' }) {
  const copy = getCopy(locale);
  const chain = latestRetakeChain(items);
  if (!chain.length) return null;

  const first = chain[0].comparison!;
  const points = [
    { id: first.original_review_id, score: first.overall_before, label: copy.original },
    ...chain.map((item, index) => ({ id: item.review_id, score: item.comparison!.overall_after, label: `${copy.retake} ${index + 1}` })),
  ];
  const width = 620;
  const height = 180;
  const paddingX = 32;
  const paddingY = 22;
  const xFor = (index: number) => points.length === 1 ? width / 2 : paddingX + (index * (width - paddingX * 2)) / (points.length - 1);
  const yFor = (score: number) => height - paddingY - (Math.max(0, Math.min(10, score)) / 10) * (height - paddingY * 2);
  const polyline = points.map((point, index) => `${xFor(index)},${yFor(point.score)}`).join(' ');
  const latest = chain[chain.length - 1];
  const latestComparison = latest.comparison!;

  return (
    <section className="ui-feature-panel mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sage">{copy.label}</p>
          <h2 className="mt-2 font-display text-2xl text-ink">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <Link href={`/reviews/${latest.review_id}?back=/account/reviews`} className="inline-flex min-h-11 items-center gap-2 rounded-control border border-sage/30 px-3 py-2 text-xs font-semibold text-sage transition-colors hover:bg-sage/10">
          {copy.open}<ArrowUpRight size={13} />
        </Link>
      </div>

      <div className="mt-5 rounded-card border border-border-subtle bg-void/30 p-2 sm:p-3">
        <svg viewBox={`0 0 ${width} ${height + 34}`} className="h-auto w-full" role="img" aria-label={copy.title}>
          {[0, 5, 10].map((score) => <line key={score} x1={paddingX} x2={width - paddingX} y1={yFor(score)} y2={yFor(score)} stroke="currentColor" className="text-border" strokeDasharray="4 5" />)}
          <polyline points={polyline} fill="none" stroke="rgb(var(--color-sage))" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((point, index) => (
            <g key={`${point.id}-${index}`}>
              <circle cx={xFor(index)} cy={yFor(point.score)} r="7" fill="rgb(var(--color-surface))" stroke="rgb(var(--color-sage))" strokeWidth="4" />
              <text x={xFor(index)} y={yFor(point.score) - 13} textAnchor="middle" className="fill-current text-[12px] font-medium text-ink">{point.score.toFixed(1)}</text>
              <text x={xFor(index)} y={height + 20} textAnchor="middle" className="fill-current text-[11px] text-ink-subtle">{point.label}</text>
            </g>
          ))}
        </svg>
      </div>

      <div className="mt-4">
        <div className="mb-3 flex items-center gap-2 text-sm text-ink"><Camera size={15} className="text-gold" /><span>{copy.latest}</span></div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {DIMENSIONS.map((key) => {
            const delta = latestComparison.dimensions[key].delta;
            const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
            const tone = delta > 0 ? 'text-sage' : delta < 0 ? 'text-rust' : 'text-ink-muted';
            const trend = delta > 0 ? copy.trend.improved : delta < 0 ? copy.trend.declined : copy.trend.flat;
            return (
              <div key={key} className="rounded-control border border-border-subtle bg-raised/70 px-3 py-3">
                <p className="text-xs text-ink-subtle">{copy.dimensions[key]}</p>
                <p className={`mt-2 flex items-center gap-1.5 text-lg font-semibold ${tone}`}><Icon size={14} aria-hidden="true" />{delta > 0 ? '+' : ''}{delta}</p>
                <p className="mt-1 text-xs font-medium text-ink-muted">{trend}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
