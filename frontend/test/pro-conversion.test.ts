import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getProPlanBoundaryCopy,
  getProUpgradeTriggerCopy,
  getUsageDecisionCopy,
} from '../src/lib/pro-conversion.ts';

test('Pro boundary shifts from model depth to next-round progress value', () => {
  const copy = getProPlanBoundaryCopy('en');
  const freeText = `${copy.free.body} ${copy.free.features.join(' ')}`;
  const proText = `${copy.pro.body} ${copy.pro.features.join(' ')}`;

  assert.match(freeText, /quick diagnosis/i);
  assert.match(freeText, /basic next-step/i);
  assert.match(proText, /next-shoot guidance/i);
  assert.match(proText, /complete review loop/i);
  assert.match(proText, /progress tracking/i);
});

test('upgrade triggers speak to quota, deeper advice, history trend, and retake comparison', () => {
  assert.match(getProUpgradeTriggerCopy('zh', 'quota_floor').body, /不用反复计算额度/);
  assert.match(getProUpgradeTriggerCopy('zh', 'deeper_result').body, /下一次拍摄/);
  assert.match(getProUpgradeTriggerCopy('zh', 'history_trend').title, /趋势/);
  assert.match(getProUpgradeTriggerCopy('zh', 'retake_compare').body, /复拍对比/);
});

test('usage page copy frames billing as an upgrade decision page', () => {
  const copy = getUsageDecisionCopy('zh');

  assert.match(copy.headline, /升级决策/);
  assert.match(copy.body, /付费前后/);
  assert.deepEqual(
    copy.differences.map((item) => item.label),
    ['下一次拍摄指导', '复盘完整度', '进步追踪'],
  );
});
