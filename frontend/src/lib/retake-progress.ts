import type { ReviewHistoryItem } from './types';
import { normalizeScoreVersion } from './review-growth.ts';

export type RetakePracticeComparability =
  | 'comparable'
  | 'low_confidence'
  | 'incomparable'
  | 'unknown_version'
  | 'missing_pair_scores';

export type RetakePracticeDeltaTrend = 'improved' | 'declined' | 'flat' | 'unknown';

export interface RetakePracticeRecord {
  review: ReviewHistoryItem;
  reviewId: string;
  sourceReviewId: string | null;
  createdAt: string;
  scoreVersion: string | null;
  before: number | null;
  after: number | null;
  delta: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
  comparability: RetakePracticeComparability;
  trend: RetakePracticeDeltaTrend;
  goalMissing: boolean;
}

export interface RetakePracticeSnapshot {
  records: RetakePracticeRecord[];
  comparableCount: number;
  nonComparableCount: number;
  unknownVersionCount: number;
}

export type RetakeChainSnapshot = RetakePracticeSnapshot & {
  chain: ReviewHistoryItem[];
  scoreVersion: string | null;
  excludedVersionCount: number;
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? roundToOneDecimal(value)
    : null;
}

function compareByCreatedAtDesc(left: ReviewHistoryItem, right: ReviewHistoryItem): number {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

function hasSavedPracticeGoal(item: ReviewHistoryItem): boolean {
  const maybeGoal = item as ReviewHistoryItem & {
    practice_session_id?: string | null;
    practice_goal?: unknown;
    goal_assessment?: unknown;
  };
  return Boolean(maybeGoal.practice_session_id || maybeGoal.practice_goal || maybeGoal.goal_assessment);
}

function comparabilityFor(item: ReviewHistoryItem, scoreVersion: string | null): RetakePracticeComparability {
  const comparison = item.comparison;
  const before = finiteNumber(comparison?.overall_before);
  const after = finiteNumber(comparison?.overall_after);
  if (!scoreVersion) return 'unknown_version';
  if (before === null || after === null) return 'missing_pair_scores';
  if (comparison?.comparison_confidence === 'low') return 'low_confidence';
  if (!comparison?.is_comparable) return 'incomparable';
  return 'comparable';
}

function deltaTrend(delta: number | null): RetakePracticeDeltaTrend {
  if (delta === null) return 'unknown';
  if (delta > 0) return 'improved';
  if (delta < 0) return 'declined';
  return 'flat';
}

function buildRecord(item: ReviewHistoryItem): RetakePracticeRecord | null {
  const comparison = item.comparison;
  if (!comparison) return null;

  const before = finiteNumber(comparison.overall_before);
  const after = finiteNumber(comparison.overall_after);
  const delta = before !== null && after !== null
    ? finiteNumber(comparison.overall_delta) ?? roundToOneDecimal(after - before)
    : null;
  const scoreVersion = normalizeScoreVersion(item.score_version);

  return {
    review: item,
    reviewId: item.review_id,
    sourceReviewId: item.source_review_id ?? comparison.original_review_id ?? null,
    createdAt: item.created_at,
    scoreVersion,
    before,
    after,
    delta,
    confidence: comparison.comparison_confidence ?? null,
    comparability: comparabilityFor(item, scoreVersion),
    trend: deltaTrend(delta),
    goalMissing: !hasSavedPracticeGoal(item),
  };
}

export function buildRetakePracticeSnapshot(items: ReviewHistoryItem[]): RetakePracticeSnapshot {
  const records = items
    .filter((item) => Boolean(item.comparison))
    .sort(compareByCreatedAtDesc)
    .map(buildRecord)
    .filter((record): record is RetakePracticeRecord => Boolean(record));

  return {
    records,
    comparableCount: records.filter((record) => record.comparability === 'comparable').length,
    nonComparableCount: records.filter((record) => record.comparability !== 'comparable').length,
    unknownVersionCount: records.filter((record) => record.comparability === 'unknown_version').length,
  };
}

export function buildLatestRetakeChainSnapshot(items: ReviewHistoryItem[]): RetakeChainSnapshot {
  const snapshot = buildRetakePracticeSnapshot(items);
  const chain = snapshot.records
    .filter((record) => record.comparability === 'comparable')
    .map((record) => record.review);
  const scoreVersion = snapshot.records[0]?.scoreVersion ?? null;

  return {
    ...snapshot,
    chain,
    scoreVersion,
    excludedVersionCount: snapshot.nonComparableCount,
  };
}

export function latestRetakeChain(items: ReviewHistoryItem[]): ReviewHistoryItem[] {
  return buildLatestRetakeChainSnapshot(items).chain;
}
