import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { enTranslations } from '../src/lib/i18n-en.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { localeFromAcceptLanguage, localeFromLanguagePreferences, resolveRequestLocale } from '../src/lib/locale.ts';
import { localizedErrorMessage } from '../src/lib/error-utils.ts';

const t = (key: keyof typeof enTranslations) => zhTranslations[key] ?? enTranslations[key] ?? key;

test('current plan copy agrees on one Guest critique daily and continued Pro use with a slower minute rate', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    assert.doesNotMatch(dictionary.hero_label, /GPT-/);
    assert.match(dictionary.plan_guest_quota, /1/);
    assert.match(dictionary.plan_guest_quota, /30/);
    assert.match(dictionary.faq_a3, /150/);
    assert.match(dictionary.quota_subhead, /150/);
    assert.match(dictionary.quota_modal_body, /60/);
    assert.match(dictionary.quota_modal_body, /15/);
    assert.doesNotMatch(dictionary.quota_modal_body, /\$3\.99|升级.*Pro|upgrade to Pro/i);
    assert.match(dictionary.plan_pro_feature, /历史.*原图|history and originals|全履歴と元写真/);
    assert.match(dictionary.usage_pro_soft_counter, /\{used\}.*\{limit\}/);
  }
  assert.match(enTranslations.quota_subhead, /2 per minute.*next UTC month.*no .*automatic extra charge/);
  assert.match(zhTranslations.quota_subhead, /每分钟最多 2 次.*下个 UTC 月.*不会自动加收/);
  assert.match(jaTranslations.quota_subhead, /次の UTC 月.*毎分2回.*自動の追加請求はありません/);
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    assert.equal(localizedErrorMessage((key) => dictionary[key], 'PRO_REVIEW_RATE_LIMITED'), dictionary.err_pro_review_rate_limit_body);
    assert.match(dictionary.usage_pro_soft_reached, /\{rate\}/);
  }
});

test('image credit copy separates monthly and purchased balances and explains quality restrictions', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    assert.notEqual(dictionary.usage_generation_credits_monthly_balance, dictionary.usage_generation_credits_purchased_balance);
    assert.match(dictionary.usage_credit_pack_body, /300/);
    assert.match(dictionary.usage_credit_pack_body, /Free/);
    assert.match(dictionary.usage_credit_pack_body, /High|高画質/);
  }
  assert.match(zhTranslations.usage_credit_pack_body, /300 credits/);
  assert.doesNotMatch(zhTranslations.usage_credit_pack_body, /300 张 AI 生图额度/);
});

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
  assert.equal(localizedErrorMessage(t, 'REVIEW_NOT_APPLICABLE'), zhTranslations.task_not_applicable_detail);
  assert.equal(localizedErrorMessage(t, 'UNMAPPED_CODE', 'fallback'), 'fallback');
});

test('removed review links and replay sources use the existing localized unavailable-content message', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const translate = (key: keyof typeof enTranslations) => dictionary[key];
    assert.equal(localizedErrorMessage(translate, 'REVIEW_NOT_FOUND'), dictionary.err_not_found_body);
    assert.equal(localizedErrorMessage(translate, 'SOURCE_REVIEW_NOT_FOUND'), dictionary.err_not_found_body);
    assert.equal(localizedErrorMessage(translate, { code: 'REVIEW_NOT_FOUND' }, 'private backend detail'), dictionary.err_not_found_body);
  }
});

test('photography applicability messages use a dedicated outcome and new-photo action in every locale', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    for (const key of ['task_not_applicable_label', 'task_not_applicable_detail', 'task_not_applicable_no_charge', 'task_upload_photograph', 'practice_attempt_not_applicable'] as const) {
      assert.ok(dictionary[key].trim(), key);
    }
    const translate = (key: keyof typeof enTranslations) => dictionary[key];
    assert.equal(localizedErrorMessage(translate, 'REVIEW_NOT_APPLICABLE'), dictionary.task_not_applicable_detail);
    assert.notEqual(dictionary.task_not_applicable_label, dictionary.task_failed_label);
    assert.notEqual(dictionary.task_upload_photograph, dictionary.task_retry);
  }
});

test('terminal task failures use plain language and state that no allowance was used', () => {
  const internalQueueTerms = /dead[\s-]*letter|queue|死信|队列|デッドレター|キュー/i;
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    for (const key of ['task_failed_label', 'task_failed_detail', 'task_expired_label', 'task_expired_detail', 'task_dead_letter_label', 'task_dead_letter_detail', 'task_failed_no_charge', 'task_retrying_notice'] as const) {
      assert.ok(dictionary[key].trim(), key);
      assert.doesNotMatch(dictionary[key], internalQueueTerms, key);
    }
    assert.notEqual(dictionary.task_failed_no_charge, dictionary.task_not_applicable_no_charge);
  }
});

test('idempotency conflicts use request-neutral copy for generation and practice', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const translate = (key: keyof typeof enTranslations) => dictionary[key];
    for (const code of ['IDEMPOTENCY_CONFLICT', 'PRACTICE_SESSION_DUPLICATE', 'PRACTICE_ATTEMPT_DUPLICATE_TASK']) {
      assert.equal(localizedErrorMessage(translate, code), dictionary.err_idempotency_conflict_body);
    }
    assert.doesNotMatch(dictionary.err_idempotency_conflict_body, /practice|练习|練習/i);
    assert.match(dictionary.err_idempotency_conflict_body, /new request|新请求|新しいリクエスト/);
  }
});

test('in-progress idempotent critiques use a retry message distinct from conflicting new requests', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    const translated = localizedErrorMessage((key) => dictionary[key], 'IDEMPOTENCY_IN_PROGRESS');
    assert.equal(translated, dictionary.err_idempotency_in_progress_body);
    assert.notEqual(translated, dictionary.err_idempotency_conflict_body);
    assert.doesNotMatch(translated, /new request|新请求|新しいリクエスト|upgrade|升级|アップグレード/i);
  }
});

test('score feedback labels are complete and preserve the direction of the AI score judgment', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    for (const key of ['score_feedback_accurate', 'score_feedback_too_high', 'score_feedback_too_low', 'score_feedback_score_changed', 'score_feedback_version_changed', 'score_feedback_private', 'score_feedback_withdrawing', 'score_feedback_withdraw_failed'] as const) {
      assert.ok(dictionary[key].trim(), key);
    }
    assert.notEqual(dictionary.score_feedback_too_high, dictionary.score_feedback_too_low);
  }
  assert.match(zhTranslations.score_feedback_hint, /AI 给分过高/);
  assert.match(zhTranslations.score_feedback_private, /不会直接调整/);
});
