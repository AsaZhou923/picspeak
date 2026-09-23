'use client';

import Link from 'next/link';
import { ArrowUpRight, Camera, Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getScoreVersionLabel } from '@/lib/review-growth';
import { buildRetakePracticeSnapshot, type RetakePracticeRecord } from '@/lib/retake-progress';
import type { ReviewHistoryItem } from '@/lib/types';

function getCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Retake Records',
      title: '再撮影の練習記録',
      body: '各カードは1回のペア比較だけを示します。別リクエストのスコアを能力曲線として接続しません。',
      empty: '再撮影の比較記録はまだありません。',
      latest: '各回の結果',
      open: '比較を見る',
      before: 'Before',
      after: 'After',
      delta: 'Delta',
      scoreVersion: '基準',
      confidence: '信頼度',
      summary: (comparable: number, other: number) => `比較可能 ${comparable} 件 · 要注意 ${other} 件`,
      status: {
        comparable: 'このペア内で比較可能',
        low_confidence: '低信頼度',
        incomparable: '比較不可',
        unknown_version: '不明な基準',
        missing_pair_scores: 'ペアスコア不足',
      },
      goalMissing: '保存済み目標なし',
      trend: { improved: '上昇', declined: '低下', flat: '同点', unknown: '不明' },
    };
  }
  if (locale === 'en') {
    return {
      label: 'Retake Records',
      title: 'Retake practice records',
      body: 'Each card shows one paired request. Scores from separate requests are not connected into a continuous ability curve.',
      empty: 'No retake comparison records yet.',
      latest: 'Round results',
      open: 'Open comparison',
      before: 'Before',
      after: 'After',
      delta: 'Delta',
      scoreVersion: 'Rubric',
      confidence: 'Confidence',
      summary: (comparable: number, other: number) => `${comparable} comparable · ${other} flagged`,
      status: {
        comparable: 'Comparable within this pair',
        low_confidence: 'Low confidence',
        incomparable: 'Not comparable',
        unknown_version: 'Unknown rubric',
        missing_pair_scores: 'Missing paired scores',
      },
      goalMissing: 'No saved goal',
      trend: { improved: 'Higher', declined: 'Lower', flat: 'Tie', unknown: 'Unknown' },
    };
  }
  return {
    label: '复拍记录',
    title: '逐轮练习记录',
    body: '每张卡片只展示一次成对请求的结果，不把不同请求的分数连成连续能力曲线。',
    empty: '还没有复拍比较记录。',
    latest: '各轮结果',
    open: '查看对比',
    before: 'Before',
    after: 'After',
    delta: 'Delta',
    scoreVersion: '标尺',
    confidence: '置信度',
    summary: (comparable: number, other: number) => `可比较 ${comparable} 条 · 需谨慎 ${other} 条`,
    status: {
      comparable: '仅在本轮成对请求内可比',
      low_confidence: '低置信度',
      incomparable: '不可比',
      unknown_version: '未知标尺',
      missing_pair_scores: '缺少成对分数',
    },
    goalMissing: '未保存目标',
    trend: { improved: '上升', declined: '下降', flat: '持平', unknown: '未知' },
  };
}

function formatScore(value: number | null): string {
  return value === null ? '-' : value.toFixed(1);
}

function formatDelta(value: number | null): string {
  if (value === null) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}

function trendTone(record: RetakePracticeRecord): string {
  if (record.comparability !== 'comparable') return 'text-ink-muted';
  if (record.trend === 'improved') return 'text-sage';
  if (record.trend === 'declined') return 'text-rust';
  return 'text-ink-muted';
}

function statusTone(record: RetakePracticeRecord): string {
  if (record.comparability === 'comparable') return 'border-sage/30 bg-sage/10 text-sage';
  if (record.comparability === 'low_confidence') return 'border-gold/30 bg-gold/10 text-gold';
  return 'border-border-subtle bg-raised/70 text-ink-muted';
}

export function RetakeProgressPanel({ items, locale }: { items: ReviewHistoryItem[]; locale: 'zh' | 'en' | 'ja' }) {
  const copy = getCopy(locale);
  const snapshot = buildRetakePracticeSnapshot(items);
  const records = snapshot.records;

  return (
    <section className="ui-feature-panel mb-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-sage">{copy.label}</p>
          <h2 className="mt-2 font-display text-2xl text-ink">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{copy.body}</p>
          <p className="mt-2 inline-flex rounded-full border border-border-subtle bg-raised/70 px-3 py-1 text-[11px] text-ink-muted">
            {copy.summary(snapshot.comparableCount, snapshot.nonComparableCount)}
          </p>
        </div>
      </div>

      {!records.length ? (
        <p className="mt-5 rounded-card border border-border-subtle bg-raised/70 px-4 py-3 text-sm text-ink-muted">
          {copy.empty}
        </p>
      ) : (
        <div className="mt-5">
          <div className="mb-3 flex items-center gap-2 text-sm text-ink">
            <Camera size={15} className="text-gold" />
            <span>{copy.latest}</span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {records.map((record) => {
              const Icon = record.trend === 'improved'
                ? TrendingUp
                : record.trend === 'declined'
                  ? TrendingDown
                  : Minus;
              return (
                <article key={record.reviewId} className="rounded-card border border-border-subtle bg-raised/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <span className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-medium ${statusTone(record)}`}>
                        {copy.status[record.comparability]}
                      </span>
                      {record.goalMissing && (
                        <span className="ml-2 inline-flex rounded-full border border-border-subtle bg-void/40 px-3 py-1 text-[11px] text-ink-muted">
                          {copy.goalMissing}
                        </span>
                      )}
                    </div>
                    <Link href={`/reviews/${record.reviewId}?back=/account/reviews`} className="inline-flex min-h-9 items-center gap-1.5 rounded-control border border-sage/30 px-3 py-1.5 text-xs font-semibold text-sage transition-colors hover:bg-sage/10">
                      {copy.open}<ArrowUpRight size={13} />
                    </Link>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-control border border-border-subtle bg-void/30 px-3 py-2">
                      <p className="text-[11px] uppercase text-ink-subtle">{copy.before}</p>
                      <p className="mt-1 font-display text-2xl text-ink">{formatScore(record.before)}</p>
                    </div>
                    <div className="rounded-control border border-border-subtle bg-void/30 px-3 py-2">
                      <p className="text-[11px] uppercase text-ink-subtle">{copy.after}</p>
                      <p className="mt-1 font-display text-2xl text-ink">{formatScore(record.after)}</p>
                    </div>
                    <div className="rounded-control border border-border-subtle bg-void/30 px-3 py-2">
                      <p className="text-[11px] uppercase text-ink-subtle">{copy.delta}</p>
                      <p className={`mt-1 flex items-center gap-1 font-display text-2xl ${trendTone(record)}`}>
                        <Icon size={16} aria-hidden="true" />
                        {formatDelta(record.delta)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1 text-ink-muted">
                      {copy.scoreVersion}: {getScoreVersionLabel(record.scoreVersion, locale)}
                    </span>
                    <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1 text-ink-muted">
                      {copy.confidence}: {record.confidence ?? '-'}
                    </span>
                    <span className="rounded-full border border-border-subtle bg-void/30 px-3 py-1 text-ink-muted">
                      {copy.trend[record.trend]}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
