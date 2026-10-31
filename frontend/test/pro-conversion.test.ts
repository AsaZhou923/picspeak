import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getProPlanBoundaryCopy,
  getProUpgradeTriggerCopy,
  getUsageDecisionCopy,
} from '../src/lib/pro-conversion.ts';

test('Pro boundary sells usage, deep mode, and history rather than features Free already has', () => {
  const copy = getProPlanBoundaryCopy('en');
  const freeText = `${copy.free.body} ${copy.free.features.join(' ')}`;
  const proText = `${copy.pro.body} ${copy.pro.features.join(' ')}`;

  assert.match(copy.body, /both plans/i);
  assert.match(freeText, /retake comparison/i);
  assert.match(freeText, /60 critiques/i);
  assert.match(proText, /no monthly critique limit/i);
  assert.match(proText, /deep mode/i);
  assert.match(proText, /while subscribed/i);
});

test('Free / Pro copy never presents next-shoot guidance or retake comparison as Pro-only', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const pro = getProPlanBoundaryCopy(locale).pro;
    const proText = `${pro.body} ${pro.features.join(' ')}`;
    assert.doesNotMatch(proText, /next-shoot guidance|下一次拍摄指导|次回撮影ガイド/i, locale);
    assert.doesNotMatch(proText, /permanent|永久/i, locale);
  }
});

test('current product copy never promises permanent Pro history', () => {
  const sources = [
    'src/lib/i18n-en.ts',
    'src/lib/i18n-zh.ts',
    'src/lib/i18n-ja.ts',
    'src/lib/llms.ts',
    'public/llms.txt',
    'src/components/marketing/ProPromoCard.tsx',
  ];
  for (const source of sources) {
    const text = readFileSync(source, 'utf8');
    assert.doesNotMatch(text, /permanent history|history permanently|永久历史|历史永久|永久履歴|永続履歴|非公開履歴は永久/i, source);
  }
});

test('Free plan descriptions agree on fifteen-day history in every locale', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const historyFeature = getProPlanBoundaryCopy(locale).free.features.find((feature) => /历史|history|履歴/i.test(feature));
    assert.ok(historyFeature, locale);
    assert.match(historyFeature, /15/, locale);
    assert.doesNotMatch(historyFeature, /30/, locale);
  }
});

test('upgrade triggers speak to quota, deeper advice, history trend, and retake comparison', () => {
  assert.match(getProUpgradeTriggerCopy('zh', 'quota_floor').body, /不用反复计算额度/);
  assert.match(getProUpgradeTriggerCopy('zh', 'deeper_result').body, /深度模式/);
  assert.match(getProUpgradeTriggerCopy('zh', 'history_trend').title, /趋势/);
  assert.match(getProUpgradeTriggerCopy('zh', 'retake_compare').body, /上传修改版或新照片/);
  assert.doesNotMatch(getProUpgradeTriggerCopy('zh', 'retake_compare').body, /同图再分析/);
  assert.doesNotMatch(getProUpgradeTriggerCopy('en', 'retake_compare').body, /same-photo reruns/i);
  assert.doesNotMatch(getProUpgradeTriggerCopy('ja', 'retake_compare').body, /同じ写真の再分析/);
});

test('usage page copy frames billing as an upgrade decision page', () => {
  const copy = getUsageDecisionCopy('zh');

  assert.match(copy.headline, /升级决策/);
  assert.match(copy.body, /付费前后/);
  assert.deepEqual(
    copy.differences.map((item) => item.label),
    ['点评次数', '深度模式', '历史保留'],
  );
});
