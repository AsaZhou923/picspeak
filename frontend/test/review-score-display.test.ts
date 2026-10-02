import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDimColorClass,
  getDimTextClass,
  getScoreLabelColor,
  getScoreLabelKey,
} from '../src/lib/score-display.ts';

const V5 = 'score-v5-evidence-calibrated';
const V5_PROMPT = 'photo-score-v5-evidence-calibrated';
const V6 = 'score-v6-evidence-independent';
const V6_PROMPT = 'photo-score-v6-evidence-independent';
const V7 = 'score-v7-canonical-quality';
const V7_PROMPT = 'photo-score-v7-canonical-quality';

test('v5 score labels use explicit lower-bound buckets', () => {
  assert.equal(getScoreLabelKey(7.6, V5), 'score_label_7');
  assert.equal(getScoreLabelKey(7.9, V5), 'score_label_7');
  assert.equal(getScoreLabelKey(8.0, V5), 'score_label_8');
  assert.equal(getScoreLabelKey(8.4, V5), 'score_label_8');
  assert.equal(getScoreLabelKey(7.9, V5_PROMPT), 'score_label_7');
});

test('v6 score labels use explicit lower-bound buckets', () => {
  assert.equal(getScoreLabelKey(7.6, V6), 'score_label_7');
  assert.equal(getScoreLabelKey(7.9, V6), 'score_label_7');
  assert.equal(getScoreLabelKey(8.0, V6), 'score_label_8');
  assert.equal(getScoreLabelKey(8.4, V6), 'score_label_8');
  assert.equal(getScoreLabelKey(7.9, V6_PROMPT), 'score_label_7');
});

test('v7 score labels use explicit lower-bound buckets', () => {
  assert.equal(getScoreLabelKey(7.6, V7), 'score_label_7');
  assert.equal(getScoreLabelKey(7.9, V7), 'score_label_7');
  assert.equal(getScoreLabelKey(8.0, V7), 'score_label_8');
  assert.equal(getScoreLabelKey(8.4, V7), 'score_label_8');
  assert.equal(getScoreLabelKey(7.9, V7_PROMPT), 'score_label_7');
});

test('legacy score labels keep rounded buckets', () => {
  assert.equal(getScoreLabelKey(7.6, 'score-v4-intent-aware'), 'score_label_8');
  assert.equal(getScoreLabelKey(7.9, null), 'score_label_8');
  assert.equal(getScoreLabelKey(8.4, undefined), 'score_label_8');
});

test('v5 high-score colors start at the selected-work threshold', () => {
  assert.equal(getScoreLabelColor(7.9, V5), 'text-gold');
  assert.equal(getScoreLabelColor(8.0, V5), 'text-sage');
  assert.equal(getDimColorClass(7.9, V5), 'bg-gold');
  assert.equal(getDimColorClass(8.0, V5), 'bg-sage');
  assert.equal(getDimTextClass(7.9, V5), 'text-gold');
  assert.equal(getDimTextClass(8.0, V5), 'text-sage');
});

test('v6 high-score colors start at the selected-work threshold', () => {
  assert.equal(getScoreLabelColor(7.9, V6), 'text-gold');
  assert.equal(getScoreLabelColor(8.0, V6), 'text-sage');
  assert.equal(getDimColorClass(7.9, V6_PROMPT), 'bg-gold');
  assert.equal(getDimColorClass(8.0, V6_PROMPT), 'bg-sage');
  assert.equal(getDimTextClass(7.9, V6), 'text-gold');
  assert.equal(getDimTextClass(8.0, V6), 'text-sage');
});

test('v7 high-score colors start at the selected-work threshold', () => {
  assert.equal(getScoreLabelColor(7.9, V7), 'text-gold');
  assert.equal(getScoreLabelColor(8.0, V7), 'text-sage');
  assert.equal(getDimColorClass(7.9, V7_PROMPT), 'bg-gold');
  assert.equal(getDimColorClass(8.0, V7_PROMPT), 'bg-sage');
  assert.equal(getDimTextClass(7.9, V7), 'text-gold');
  assert.equal(getDimTextClass(8.0, V7), 'text-sage');
});

test('legacy high-score colors keep the existing visual threshold', () => {
  assert.equal(getScoreLabelColor(7.6, 'score-v4-intent-aware'), 'text-sage');
  assert.equal(getDimColorClass(7.6, 'score-v4-intent-aware'), 'bg-sage');
  assert.equal(getDimTextClass(7.6, null), 'text-sage');
});
