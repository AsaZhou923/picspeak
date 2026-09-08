import type { ReviewHistoryItem } from './types';
import { normalizeScoreVersion } from './review-growth.ts';

export interface RetakeChainSnapshot {
  chain: ReviewHistoryItem[];
  scoreVersion: string | null;
  excludedVersionCount: number;
}

function hasPairedScores(item: ReviewHistoryItem): boolean {
  const comparison = item.comparison;
  return (
    typeof comparison?.overall_before === 'number'
    && Number.isFinite(comparison.overall_before)
    && typeof comparison.overall_after === 'number'
    && Number.isFinite(comparison.overall_after)
  );
}

function isComparableRetake(item: ReviewHistoryItem): boolean {
  return Boolean(
    item.comparison?.is_comparable
    && item.comparison.comparison_confidence !== 'low'
    && hasPairedScores(item)
  );
}

function pathEndingAt(item: ReviewHistoryItem, byId: Map<string, ReviewHistoryItem>): ReviewHistoryItem[] {
  const path = [item];
  const scoreVersion = normalizeScoreVersion(item.score_version);
  let current: ReviewHistoryItem | undefined = item;
  const visited = new Set<string>();
  while (current?.source_review_id && !visited.has(current.review_id)) {
    visited.add(current.review_id);
    const parent = byId.get(current.source_review_id);
    if (
      !parent
      || normalizeScoreVersion(parent.score_version) !== scoreVersion
      || !isComparableRetake(parent)
    ) {
      break;
    }
    path.unshift(parent);
    current = parent;
  }
  return path;
}

export function buildLatestRetakeChainSnapshot(items: ReviewHistoryItem[]): RetakeChainSnapshot {
  const comparable = items
    .filter(isComparableRetake)
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  const scoreVersion = normalizeScoreVersion(comparable[0]?.score_version);
  if (!scoreVersion) {
    return {
      chain: [],
      scoreVersion: null,
      excludedVersionCount: comparable.length,
    };
  }

  const versioned = comparable.filter((item) => normalizeScoreVersion(item.score_version) === scoreVersion);
  const byId = new Map(versioned.map((item) => [item.review_id, item]));
  const paths = versioned.map((item) => pathEndingAt(item, byId));

  const chain = paths
    .sort((left, right) => {
      if (right.length !== left.length) return right.length - left.length;
      return new Date(right[right.length - 1].created_at).getTime() - new Date(left[left.length - 1].created_at).getTime();
    })[0] ?? [];

  return {
    chain,
    scoreVersion,
    excludedVersionCount: comparable.length - versioned.length,
  };
}

export function latestRetakeChain(items: ReviewHistoryItem[]): ReviewHistoryItem[] {
  return buildLatestRetakeChainSnapshot(items).chain;
}
