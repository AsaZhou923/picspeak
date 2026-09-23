import test from 'node:test';
import assert from 'node:assert/strict';

import {
  attemptDisplayState,
  canContinuePractice,
  isFreshPracticeRequest,
  isLegacyRetakeComparison,
  legacyComparisonPanelState,
  latestPracticeAssessment,
  latestPracticeDate,
  practiceJournalAttemptState,
  practiceLifecycleActions,
  practiceContinuationId,
  sessionDimension,
  sessionGoal,
  sessionSourceAccess,
  sourceAccessCopyKey,
} from '../src/features/practice/journal.ts';
import type {
  PracticeAttemptSummary,
  PracticeSessionListItem,
  PracticeSessionsResponse,
  PracticeSummaryResponse,
  ReviewHistoryItem,
  ReviewScores,
} from '../src/lib/types.ts';

function attempt(overrides: Partial<PracticeAttemptSummary>): PracticeAttemptSummary {
  return {
    attempt_id: 'pra_test',
    task_id: 'task_test',
    review_id: null,
    review_access: 'none',
    task_status: 'PENDING',
    progress: 0,
    error: null,
    sequence: 1,
    photo_id: 'photo_test',
    kind: 'capture_retake',
    created_at: '2026-09-19T00:00:00Z',
    ...overrides,
  };
}

function session(overrides: Partial<PracticeSessionListItem>): PracticeSessionListItem {
  return {
    session_id: 'prs_test',
    lifecycle: 'active',
    practice_kind: 'capture_retake',
    goal: 'Keep the subject separated from the background.',
    dimension: 'composition',
    source: {
      access: 'available',
      review_id: 'rev_source',
      photo_id: 'photo_source',
      genre: 'street',
    },
    attempt_count: 1,
    latest_assessment_status: 'unknown',
    latest_assessment_date: '2026-09-19T00:00:00Z',
    continuation_id: 'prs_test',
    continue_available: true,
    latest_attempt: {
      attempt_id: 'pra_test',
      task_id: 'task_test',
      review_id: null,
      review_access: 'none',
      assessment_status: 'unknown',
      created_at: '2026-09-19T00:00:00Z',
    },
    created_at: '2026-09-18T00:00:00Z',
    updated_at: '2026-09-19T00:00:00Z',
    ...overrides,
  };
}

function scores(): ReviewScores {
  return {
    composition: 6,
    lighting: 6,
    color: 6,
    impact: 6,
    technical: 6,
  };
}

function historyItem(overrides: Partial<ReviewHistoryItem>): ReviewHistoryItem {
  return {
    review_id: 'rev_retake',
    photo_id: 'photo_retake',
    photo_url: null,
    mode: 'flash',
    status: 'SUCCEEDED',
    image_type: 'street',
    source_review_id: 'rev_source',
    final_score: 6,
    scores: scores(),
    model_name: 'writer',
    model_version: '2026-09',
    scorer_model_name: 'scorer',
    scorer_model_version: '2026-09',
    writer_model_name: 'writer',
    writer_model_version: '2026-09',
    score_version: 'score-v5-evidence-calibrated',
    comparison: {
      original_review_id: 'rev_source',
      original_photo_id: 'photo_source',
      retake_photo_id: 'photo_retake',
      is_comparable: true,
      comparison_confidence: 'medium',
      comparison_caveat: '',
      summary: 'Retake comparison',
      dimensions: {
        composition: { before_score: 5, after_score: 6, delta: 1, trend: 'improved', evidence: [], remaining_gap: '' },
        lighting: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        color: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        impact: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
        technical: { before_score: 5, after_score: 5, delta: 0, trend: 'flat', evidence: [], remaining_gap: '' },
      },
      overall_before: 5,
      overall_after: 6,
      overall_delta: 1,
      strongest_improvement: 'composition',
      next_actions: [],
      visual_reference_prompt: '',
      openai_response_id: 'resp_test',
    },
    created_at: '2026-09-19T00:00:00Z',
    ...overrides,
  };
}

test('practice attempt display keeps pending, failed, and successful states separate', () => {
  assert.equal(attemptDisplayState(attempt({ task_status: 'PENDING', review_id: null })), 'pending');
  assert.equal(attemptDisplayState(attempt({ task_status: 'FAILED', error: { code: 'MODEL_FAILED', message: 'failed', retryable: true, timeout: false, failure_stage: 'ai', quota_charged: false } })), 'failed');
  assert.equal(attemptDisplayState(attempt({ task_status: 'SUCCEEDED', review_id: 'rev_done' })), 'success');
  assert.equal(attemptDisplayState(attempt({ task_status: 'SUCCEEDED', review_id: null })), 'pending');
});

test('practice journal does not treat indeterminate or unavailable source as resumable completion', () => {
  assert.equal(latestPracticeAssessment(session({ latest_assessment_status: 'indeterminate' })), 'indeterminate');
  assert.equal(latestPracticeAssessment(session({ latest_assessment_status: 'unknown' })), 'unknown');
  assert.equal(canContinuePractice(session({ lifecycle: 'active', source: { access: 'available', review_id: 'rev_source', photo_id: 'photo_source', genre: 'street' }, continue_available: true, continuation_id: 'prs_test' })), true);
  assert.equal(canContinuePractice(session({ lifecycle: 'completed', source: { access: 'available', review_id: 'rev_source', photo_id: 'photo_source', genre: 'street' }, continue_available: true, continuation_id: 'prs_test' })), false);
  assert.equal(canContinuePractice(session({ lifecycle: 'active', source: { access: 'deleted', review_id: null, photo_id: null, genre: null }, continue_available: false, continuation_id: null })), false);
  assert.equal(sourceAccessCopyKey('expired'), 'expired');
  assert.equal(sourceAccessCopyKey('photo_unavailable'), 'photo_unavailable');
});

test('practice journal helpers accept backend list and summary response shapes', () => {
  const listResponse: PracticeSessionsResponse = {
    limit: 20,
    next_cursor: 'eyJjcmVhdGVkX2F0IjoiMjAyNi0wOS0xOVQwMDowMDowMCswMDowMCIsImlkIjoxfQ',
    items: [
      session({
        latest_assessment_status: 'achieved',
        latest_assessment_date: '2026-09-19T01:00:00Z',
        latest_attempt: {
          attempt_id: 'pra_done',
          task_id: 'task_done',
          review_id: 'rev_done',
          review_access: 'available',
          assessment_status: 'achieved',
          created_at: '2026-09-19T01:00:00Z',
        },
      }),
      session({
        session_id: 'prs_private',
        source: { access: 'photo_unavailable', review_id: null, photo_id: null, genre: null },
        continuation_id: null,
        continue_available: false,
        latest_assessment_status: 'failed',
        latest_attempt: {
          attempt_id: 'pra_failed',
          task_id: null,
          review_id: null,
          review_access: 'photo_unavailable',
          assessment_status: 'failed',
          created_at: '2026-09-19T02:00:00Z',
        },
      }),
    ],
  };
  const summaryResponse: PracticeSummaryResponse = {
    scope: 'all_practice',
    timeframe: { start_at: '2026-09-18T00:00:00Z', end_at: '2026-09-19T02:00:00Z' },
    session_count: 2,
    attempt_count: 2,
    sample_count: 1,
    status_counts: { achieved: 1, partial: 0, not_achieved: 0, indeterminate: 0 },
    unknown_count: 0,
    indeterminate_count: 0,
    failed_count: 1,
  };

  assert.equal(sessionGoal(listResponse.items[0]), 'Keep the subject separated from the background.');
  assert.equal(sessionDimension(listResponse.items[0]), 'composition');
  assert.equal(sessionSourceAccess(listResponse.items[1]), 'photo_unavailable');
  assert.equal(latestPracticeAssessment(listResponse.items[0]), 'achieved');
  assert.equal(latestPracticeDate(listResponse.items[0]), '2026-09-19T01:00:00Z');
  assert.equal(practiceContinuationId(listResponse.items[0]), 'prs_test');
  assert.equal(practiceContinuationId(listResponse.items[1]), null);
  assert.equal(summaryResponse.status_counts.achieved, 1);
  assert.equal(summaryResponse.unknown_count, 0);
  assert.equal(summaryResponse.failed_count, 1);
});

test('practice journal labels zero-attempt sessions as not started', () => {
  assert.equal(practiceJournalAttemptState(session({
    attempt_count: 0,
    latest_attempt: null,
    latest_assessment_status: 'unknown',
  })), 'not_started');
  assert.equal(practiceJournalAttemptState(session({
    attempt_count: 1,
    latest_assessment_status: 'not_achieved',
    latest_attempt: {
      attempt_id: 'pra_reviewed',
      task_id: 'task_reviewed',
      review_id: 'rev_reviewed',
      review_access: 'available',
      assessment_status: 'not_achieved',
      created_at: '2026-09-19T03:00:00Z',
    },
  })), 'success');
});

test('practice lifecycle actions expose restore for completed and archived sessions', () => {
  assert.deepEqual(practiceLifecycleActions('active'), {
    canComplete: true,
    canArchive: true,
    canRestore: false,
  });
  assert.deepEqual(practiceLifecycleActions('completed'), {
    canComplete: false,
    canArchive: true,
    canRestore: true,
  });
  assert.deepEqual(practiceLifecycleActions('archived'), {
    canComplete: false,
    canArchive: false,
    canRestore: true,
  });
});

test('practice request freshness rejects stale and aborted async responses', () => {
  assert.equal(isFreshPracticeRequest(3, 3, { aborted: false }), true);
  assert.equal(isFreshPracticeRequest(2, 3, { aborted: false }), false);
  assert.equal(isFreshPracticeRequest(3, 3, { aborted: true }), false);
});

test('legacy retake comparisons exclude goal-based practice results', () => {
  assert.equal(isLegacyRetakeComparison(historyItem({})), true);
  assert.equal(isLegacyRetakeComparison(historyItem({ practice_session_id: 'prs_goal' })), false);
  assert.equal(isLegacyRetakeComparison(historyItem({ goal_assessment: { goal_version: 'goal-assessment-v1', status: 'partial', evidence: [], limitations: [], next_action: 'try again' } })), false);
  assert.equal(isLegacyRetakeComparison(historyItem({ source_review_id: null })), false);
});

test('legacy comparison panel keeps independent loading, error, empty, and ready states', () => {
  assert.equal(legacyComparisonPanelState({ loading: true, error: '', itemCount: 0 }), 'loading');
  assert.equal(legacyComparisonPanelState({ loading: false, error: 'Network error', itemCount: 0 }), 'error');
  assert.equal(legacyComparisonPanelState({ loading: false, error: '', itemCount: 0 }), 'empty');
  assert.equal(legacyComparisonPanelState({ loading: false, error: '', itemCount: 2 }), 'ready');
});

test('legacy comparison response is independent from practice session filters and page size', () => {
  const zeroSessionPracticePage: PracticeSessionsResponse = { items: [], next_cursor: null, limit: 20 };
  const legacyPageOne = {
    items: [historyItem({ review_id: 'rev_legacy_31' })],
    next_cursor: 'legacy-cursor-31',
  };
  const legacyPageTwo = {
    items: [historyItem({ review_id: 'rev_legacy_32' })],
    next_cursor: null,
  };

  assert.equal(zeroSessionPracticePage.items.length, 0);
  assert.equal(legacyComparisonPanelState({ loading: false, error: '', itemCount: legacyPageOne.items.length }), 'ready');
  assert.equal(legacyPageOne.next_cursor, 'legacy-cursor-31');
  assert.deepEqual([...legacyPageOne.items, ...legacyPageTwo.items].map((item) => item.review_id), ['rev_legacy_31', 'rev_legacy_32']);
});
