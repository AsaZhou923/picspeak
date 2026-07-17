import type { ReviewAnalysisType, ReviewHistoryItem } from './types';

export function resolveReviewAnalysisType(
  sourceReviewId: string | null | undefined,
  hasNewPhoto: boolean
): ReviewAnalysisType {
  return sourceReviewId && hasNewPhoto ? 'retake_compare' : 'single';
}

export function formatRetakeDelta(delta: number, comparable = true): string {
  if (!comparable) return 'N/A';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`;
}

export function getEligibleRetakeSources(items: ReviewHistoryItem[]): ReviewHistoryItem[] {
  return items.filter((item) => item.status === 'SUCCEEDED' && Boolean(item.photo_url));
}

export function buildRetakeWorkspaceHref(
  source: Pick<ReviewHistoryItem, 'review_id' | 'image_type'>
): string {
  const params = new URLSearchParams({
    source_review_id: source.review_id,
    retake_intent: 'retake_coach',
    image_type: source.image_type,
  });
  return `/workspace?${params.toString()}`;
}
