import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  coverageFacts,
  getPracticeGuidanceCopy,
  guidanceDimensionLabel,
  guidanceDisplayState,
  guidanceLevelMessage,
  localizePracticeDimensionText,
  nextRecommendationIndex,
  observationEvidenceLabel,
  recommendationActionLabel,
} from '../src/features/practice/guidance.ts';
import type {
  PracticeGuidanceCoverage,
  PracticeGuidanceObservation,
  PracticeRecommendation,
} from '../src/lib/types.ts';

const coverage: PracticeGuidanceCoverage = {
  valid_session_count: 3,
  valid_attempt_count: 3,
  scene_group_count: 2,
  goal_count: 2,
  untagged_session_count: 0,
  capture_retake_count: 2,
  edit_revision_count: 1,
  same_image_recheck_count: 0,
};

test('practice guidance helpers keep threshold states explicit', () => {
  assert.equal(guidanceDisplayState('records_only'), 'records');
  assert.equal(guidanceDisplayState('preliminary_observations'), 'observations');
  assert.equal(guidanceDisplayState('practice_summary'), 'summary');
  assert.match(guidanceLevelMessage('records_only', 'scene_groups_required', 'en'), /scene groups/i);
  assert.match(guidanceLevelMessage('practice_summary', 'enough_for_candidate_summary', 'zh'), /候选练习摘要/);
  assert.deepEqual(coverageFacts(coverage).map((item) => item.value), [3, 2, 2, 0]);
  assert.deepEqual(coverageFacts(coverage, 'zh').map((item) => item.label), ['有效练习', '场景组', '目标', '待填场景']);
});

test('practice guidance labels evidence without turning it into a score', () => {
  const observation: PracticeGuidanceObservation = {
    observation_id: 'repeated-composition',
    kind: 'repeated_issue',
    title: 'composition keeps needing another pass',
    body: 'limited observation',
    dimension: 'composition',
    source_count: 2,
    source_attempt_ids: ['pra_1', 'pra_2'],
    source_session_ids: ['prs_1', 'prs_2'],
    scene_groups: ['street', 'window'],
    evidence: [],
  };

  assert.equal(observationEvidenceLabel(observation), '2 sources · street, window');
  assert.equal(observationEvidenceLabel({ ...observation, scene_groups: [] }, 'ja'), '2 件の証拠 · シーン未設定');
  assert.equal(guidanceDimensionLabel('composition', 'ja'), '構図');
  assert.equal(localizePracticeDimensionText('composition needs a clearer edge', 'zh'), '构图 needs a clearer edge');
  assert.doesNotMatch(observationEvidenceLabel(observation), /score|能力|スコア/i);
});

test('practice recommendation action copy respects disabled creation', () => {
  const recommendation: PracticeRecommendation = {
    recommendation_id: 'rec_clean',
    template_id: 'clean-background',
    template_version: 'practice-guidance-template-v2026-09-draft',
    title: 'Clean background',
    reason: 'limited evidence',
    goal_snapshot: {
      goal_version: 'goal-assessment-v1',
      goal: 'Separate the subject from distracting background shapes.',
      dimension: 'composition',
    },
    success_criteria: [{ key: 'edge', label: 'Subject edges remain separated' }],
    suggested_scene_group: 'street',
    skip_available: true,
    change_goal_available: true,
    accept_available: false,
    accept_unavailable_reason: 'practice_disabled',
    accept_payload: null,
  };

  assert.equal(recommendationActionLabel(recommendation, 'en'), getPracticeGuidanceCopy('en').acceptDisabled);
  assert.equal(recommendationActionLabel({ ...recommendation, accept_available: true }, 'zh'), '用这个目标开始练习');
  assert.equal(nextRecommendationIndex(0, 3), 1);
  assert.equal(nextRecommendationIndex(2, 3), 0);
  assert.equal(nextRecommendationIndex(0, 1), 0);
});

test('practice page wires recommendation CTA, scene group save, stale-load guard, and localized copy', () => {
  const source = readFileSync(new URL('../src/app/account/practice/page.tsx', import.meta.url), 'utf8');

  assert.match(source, /createPracticeSession\(\{ \.\.\.payload, idempotency_key: sessionIdempotencyKey \}, token\)/);
  assert.match(source, /router\.push\(`\/workspace\?practice_session_id=\$\{encodeURIComponent\(session\.session_id\)\}`\)/);
  assert.match(source, /buildPracticeSemanticKey/);
  assert.match(source, /readPendingPracticeState/);
  assert.match(source, /writePendingPracticeState/);
  assert.match(source, /clearPendingPracticeState\(semanticKey\)/);
  assert.match(source, /updatePracticeSceneGroup\(sessionId, \{ label \}, token\)/);
  assert.match(source, /loadAllPracticeSessions/);
  assert.match(source, /requestIdRef/);
  assert.match(source, /disabled=\{actionBusy\}/);
  assert.doesNotMatch(source, /Uses practice session contract|Loading practice evidence|View practice log|>Skip<|>Change goal</);
});

test('practice guidance copy is localized for Japanese helper headings', () => {
  const copy = getPracticeGuidanceCopy('ja');
  assert.equal(copy.title, '練習プロフィール');
  assert.equal(copy.evidence, '証拠');
  assert.equal(copy.recommendations, '次のおすすめ練習');
  assert.equal(copy.templates, '練習テンプレート');
  assert.equal(copy.coverage, 'カバー状況');
});
