import type { ReviewHistoryItem } from './types';

function findRootId(item: ReviewHistoryItem, byId: Map<string, ReviewHistoryItem>): string {
  let current = item;
  const visited = new Set<string>();
  while (current.source_review_id && byId.has(current.source_review_id) && !visited.has(current.review_id)) {
    visited.add(current.review_id);
    current = byId.get(current.source_review_id)!;
  }
  return current.review_id;
}

export function latestRetakeChain(items: ReviewHistoryItem[]): ReviewHistoryItem[] {
  const comparable = items.filter((item) => (
    item.comparison?.is_comparable && item.comparison.comparison_confidence !== 'low'
  ));
  if (!comparable.length) return [];

  const byId = new Map(items.map((item) => [item.review_id, item]));
  const groups = new Map<string, ReviewHistoryItem[]>();
  for (const item of comparable) {
    const root = findRootId(item, byId);
    groups.set(root, [...(groups.get(root) ?? []), item]);
  }

  return [...groups.values()]
    .map((group) => group.sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()))
    .sort((left, right) => {
      if (right.length !== left.length) return right.length - left.length;
      return new Date(right[right.length - 1].created_at).getTime() - new Date(left[left.length - 1].created_at).getTime();
    })[0] ?? [];
}
