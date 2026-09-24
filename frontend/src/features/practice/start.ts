import type { Locale } from '@/lib/i18n';
import type { PracticeSessionCreateRequest, RetakeDimensionKey } from '@/lib/types';

export function buildPracticeStartRequest(input: {
  sourceReviewId: string;
  goal: string;
  dimension: RetakeDimensionKey;
  kind: 'capture_retake' | 'edit_revision';
  locale: Locale;
  criteria?: { key: string; label: string }[];
}): PracticeSessionCreateRequest {
  const goal = input.goal.trim();
  if (!input.sourceReviewId || goal.length < 3 || goal.length > 500) throw new Error('Invalid practice goal');
  if (!['capture_retake', 'edit_revision'].includes(input.kind)) throw new Error('A new photo is required');
  return {
    source_review_id: input.sourceReviewId,
    practice_kind: input.kind,
    goal_snapshot: { goal_version: 'goal-assessment-v1', goal, dimension: input.dimension },
    success_criteria: input.criteria?.length
      ? input.criteria.slice(0, 5)
      : [{ key: 'goal', label: goal.slice(0, 300) }],
    locale: input.locale,
  };
}
