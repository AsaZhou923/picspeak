import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { enTranslations } from '../src/lib/i18n-en.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { localeFromAcceptLanguage, localeFromLanguagePreferences, resolveRequestLocale } from '../src/lib/locale.ts';
import { localizedErrorMessage } from '../src/lib/error-utils.ts';

const t = (key: keyof typeof enTranslations) => zhTranslations[key] ?? enTranslations[key] ?? key;

test('translation dictionaries are explicit and do not inherit English with object spread', async () => {
  const [zhSource, jaSource] = await Promise.all([
    readFile(new URL('../src/lib/i18n-zh.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/i18n-ja.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(zhSource, /\.\.\.enTranslations/);
  assert.doesNotMatch(jaSource, /\.\.\.enTranslations/);
  assert.deepEqual(Object.keys(zhTranslations).sort(), Object.keys(enTranslations).sort());
  assert.deepEqual(Object.keys(jaTranslations).sort(), Object.keys(enTranslations).sort());
});

test('localized dictionaries preserve placeholders and only retain allowlisted shared product terms', () => {
  const placeholderSignature = (value: string) =>
    [...value.matchAll(/\{[^}]+\}/g)].map((match) => match[0]).sort().join('|');
  const allowedSharedValues = {
    zh: new Set([
      'filter_date_placeholder',
      'generation_examples_category_ui',
      'generation_summary_separator',
      'nav_generate_short',
      'plan_free_name',
      'plan_pro_name',
      'pro_offer_highlight',
      'review_exif_iso',
    ]),
    ja: new Set([
      'filter_date_placeholder',
      'generation_examples_category_ui',
      'generation_summary_separator',
      'nav_generate_short',
      'plan_free_name',
      'plan_pro_name',
      'pro_offer_highlight',
      'review_exif_iso',
      'usage_credit_pack_payment_hint',
    ]),
  } as const;

  for (const [locale, dictionary] of Object.entries({ zh: zhTranslations, ja: jaTranslations })) {
    for (const key of Object.keys(enTranslations) as Array<keyof typeof enTranslations>) {
      assert.equal(
        placeholderSignature(dictionary[key]),
        placeholderSignature(enTranslations[key]),
        `${locale}.${key} must preserve interpolation placeholders`,
      );

      if (dictionary[key].trim() && dictionary[key] === enTranslations[key]) {
        assert.ok(
          allowedSharedValues[locale as 'zh' | 'ja'].has(key),
          `${locale}.${key} unexpectedly retains English copy`,
        );
      }
    }
  }
});

test('Japanese UI copy does not contain known Simplified Chinese leakage', () => {
  assert.doesNotMatch(
    Object.values(jaTranslations).join('\n'),
    /见直|比较|结果|头像|额度|清単|レビュー也見る/,
  );
});

test('request locale resolves path, cookie, accept-language, and browser preference in order', () => {
  assert.equal(resolveRequestLocale('/ja/blog', 'zh', 'en-US,en;q=0.9'), 'ja');
  assert.equal(resolveRequestLocale('/gallery', 'zh', 'en-US,en;q=0.9'), 'zh');
  assert.equal(resolveRequestLocale('/gallery', null, 'ja-JP,zh;q=0.8,en;q=0.5'), 'ja');
  assert.equal(localeFromAcceptLanguage('fr-FR,zh-CN;q=0.8,en;q=0.7'), 'zh');
  assert.equal(localeFromLanguagePreferences(['fr-FR', 'ja-JP']), 'ja');
});

test('frontend error formatter maps stable backend codes to localized text instead of backend detail strings', () => {
  assert.equal(localizedErrorMessage(t, 'IMAGE_GENERATION_CREDITS_EXHAUSTED'), zhTranslations.err_generation_credits_exhausted_body);
  assert.equal(localizedErrorMessage(t, 'OPENAI_IMAGE_GENERATION_FAILED'), zhTranslations.err_generation_task_failed_body);
  assert.equal(localizedErrorMessage(t, 'UNAUTHORIZED'), zhTranslations.err_unauthorized_body);
  assert.equal(localizedErrorMessage(t, 'UNMAPPED_CODE', 'fallback'), 'fallback');
});
