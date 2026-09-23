import type {
  GoalAssessmentStatus,
  PracticeAttemptSummary,
  PracticeJournalLatestAttempt,
  PracticeKind,
  PracticeLifecycle,
  PracticeSessionListItem,
  PracticeSessionResponse,
  ReviewHistoryItem,
  TaskStatus,
} from '@/lib/types';

export type PracticeAttemptDisplayState = 'not_started' | 'pending' | 'failed' | 'success';
export type PracticeJournalItem = PracticeSessionListItem | PracticeSessionResponse;

export interface PracticeJournalCopy {
  assessment: Record<GoalAssessmentStatus | 'unknown' | 'failed', string>;
  attemptState: Record<PracticeAttemptDisplayState, string>;
  lifecycle: Record<PracticeLifecycle, string>;
  kind: Record<PracticeKind, string>;
  sourceAccess: Record<string, string>;
}

export function attemptDisplayState(attempt: PracticeAttemptSummary): PracticeAttemptDisplayState {
  const status = attempt.task_status;
  if (attempt.review_id && status === 'SUCCEEDED') {
    return 'success';
  }
  if (status === 'FAILED' || status === 'EXPIRED' || status === 'DEAD_LETTER' || attempt.error) {
    return 'failed';
  }
  return 'pending';
}

export function sessionAttempts(item: PracticeJournalItem): PracticeAttemptSummary[] {
  return 'attempts' in item ? item.attempts : [];
}

export function sessionAttemptCount(item: PracticeJournalItem): number {
  if ('attempt_count' in item) {
    return item.attempt_count;
  }
  return item.attempts.length;
}

export function latestAttempt(item: PracticeJournalItem): PracticeAttemptSummary | null {
  const attempts = sessionAttempts(item);
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

export function latestJournalAttempt(item: PracticeJournalItem): PracticeAttemptSummary | PracticeJournalLatestAttempt | null {
  if ('latest_attempt' in item) {
    return item.latest_attempt;
  }
  return latestAttempt(item);
}

export function sessionGoal(item: PracticeJournalItem): string {
  return 'goal' in item ? item.goal : item.goal_snapshot.goal;
}

export function sessionDimension(item: PracticeJournalItem): string {
  return 'dimension' in item ? item.dimension : item.goal_snapshot.dimension;
}

export function sessionSourceAccess(item: PracticeJournalItem): string {
  if ('source' in item) {
    return item.source.access;
  }
  return item.source_access ?? 'available';
}

export function sessionGenre(item: PracticeJournalItem): string | null {
  if ('source' in item) {
    return item.source.genre;
  }
  return null;
}

export function latestPracticeAssessment(item: PracticeJournalItem): GoalAssessmentStatus | 'unknown' | 'failed' {
  if ('latest_assessment_status' in item) {
    return item.latest_assessment_status;
  }
  return 'unknown';
}

export function latestPracticeDate(item: PracticeJournalItem): string | null {
  if ('latest_assessment_date' in item) {
    return item.latest_assessment_date;
  }
  const attempt = latestAttempt(item);
  return attempt?.created_at ?? item.updated_at ?? item.created_at ?? null;
}

export function practiceJournalAttemptState(
  item: PracticeJournalItem,
): PracticeAttemptDisplayState {
  const attempt = latestJournalAttempt(item);
  if (!attempt && sessionAttemptCount(item) === 0) return 'not_started';
  if (!attempt) return 'pending';
  if ('task_status' in attempt) return attemptDisplayState(attempt);
  const assessment = latestPracticeAssessment(item);
  if (assessment === 'failed') return 'failed';
  if (assessment === 'achieved' || assessment === 'partial' || assessment === 'not_achieved' || assessment === 'indeterminate') return 'success';
  return 'pending';
}

export function canContinuePractice(item: PracticeJournalItem): boolean {
  if ('continue_available' in item) {
    return item.lifecycle === 'active' && item.continue_available && Boolean(item.continuation_id);
  }
  return item.lifecycle === 'active' && sessionSourceAccess(item) === 'available';
}

export function practiceContinuationId(item: PracticeJournalItem): string | null {
  if ('continuation_id' in item) {
    return item.continuation_id;
  }
  return canContinuePractice(item) ? item.session_id : null;
}

export function sourceAccessCopyKey(access: string | null | undefined): string {
  if (access === 'deleted') return 'deleted';
  if (access === 'expired') return 'expired';
  if (access === 'hidden') return 'hidden';
  if (access === 'photo_unavailable') return 'photo_unavailable';
  return 'available';
}

export function practiceLifecycleActions(lifecycle: PracticeLifecycle): {
  canComplete: boolean;
  canArchive: boolean;
  canRestore: boolean;
} {
  return {
    canComplete: lifecycle === 'active',
    canArchive: lifecycle !== 'archived',
    canRestore: lifecycle !== 'active',
  };
}

export function isFreshPracticeRequest(
  requestId: number,
  currentRequestId: number,
  signal?: Pick<AbortSignal, 'aborted'>,
): boolean {
  return !signal?.aborted && requestId === currentRequestId;
}

export function isLegacyRetakeComparison(item: ReviewHistoryItem): boolean {
  return Boolean(
    item.source_review_id &&
      item.comparison &&
      !item.practice_session_id &&
      !item.practice?.session_id &&
      !item.goal_assessment &&
      !item.comparison.goal_assessment,
  );
}

export type LegacyComparisonPanelState = 'loading' | 'error' | 'empty' | 'ready';

export function legacyComparisonPanelState({
  loading,
  error,
  itemCount,
}: {
  loading: boolean;
  error: string;
  itemCount: number;
}): LegacyComparisonPanelState {
  if (loading) return 'loading';
  if (error) return 'error';
  return itemCount > 0 ? 'ready' : 'empty';
}

export function taskStatusToAttemptState(status: TaskStatus | null | undefined): PracticeAttemptDisplayState {
  if (status === 'SUCCEEDED') return 'success';
  if (status === 'FAILED' || status === 'EXPIRED' || status === 'DEAD_LETTER') return 'failed';
  return 'pending';
}
