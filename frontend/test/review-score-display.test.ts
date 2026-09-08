import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDimColorClass,
  getDimTextClass,
  getScoreLabelColor,
  getScoreLabelKey,
} from '../src/lib/score-display.ts';

const V5 = 'score-v5-evidence-calibrated';

test('v5 score labels use explicit lower-bound buckets', () => {
  assert.equal(getScoreLabelKey(7.6, V5), 'score_label_7');
  assert.equal(getScoreLabelKey(7.9, V5), 'score_label_7');
  assert.equal(getScoreLabelKey(8.0, V5), 'score_label_8');
  assert.equal(getScoreLabelKey(8.4, V5), 'score_label_8');
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

test('legacy high-score colors keep the existing visual threshold', () => {
  assert.equal(getScoreLabelColor(7.6, 'score-v4-intent-aware'), 'text-sage');
  assert.equal(getDimColorClass(7.6, 'score-v4-intent-aware'), 'bg-sage');
  assert.equal(getDimTextClass(7.6, null), 'text-sage');
});
