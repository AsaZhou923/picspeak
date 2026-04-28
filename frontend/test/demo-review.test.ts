import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_IMAGE_FALLBACK_URL } from '../src/lib/demo-review.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';

test('demo critique fallback image matches the ginkgo review', () => {
  assert.match(DEMO_IMAGE_FALLBACK_URL, /obj_4fea1f667283448c\.jpg$/);
  assert.doesNotMatch(DEMO_IMAGE_FALLBACK_URL, /photo-soft-airy-35mm/);
});

test('demo critique detail copy is localized for Chinese', () => {
  assert.notEqual(zhTranslations.demo_review_advantage, enTranslations.demo_review_advantage);
  assert.notEqual(zhTranslations.demo_review_critique, enTranslations.demo_review_critique);
  assert.notEqual(zhTranslations.demo_review_suggestions, enTranslations.demo_review_suggestions);
  assert.match(zhTranslations.demo_review_advantage, /银杏/);
  assert.match(zhTranslations.demo_review_critique, /空间深度/);
  assert.match(zhTranslations.demo_review_suggestions, /机位调整/);
  assert.doesNotMatch(zhTranslations.demo_review_critique, /Flat depth|No narrative/);
});

test('demo critique Japanese copy avoids known mojibake-like wording', () => {
  const joined = [
    jaTranslations.demo_advantage_body,
    jaTranslations.demo_suggestion_body,
    jaTranslations.demo_review_advantage,
    jaTranslations.demo_review_critique,
    jaTranslations.demo_review_suggestions,
  ].join('\n');

  assert.doesNotMatch(joined, /絈|明竮|奔行|誤導|摇れる|動し/);
});
