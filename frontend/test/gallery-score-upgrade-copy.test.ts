import test from 'node:test';
import assert from 'node:assert/strict';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';

test('gallery upgrade copy explains the user-facing change in every locale', () => {
  assert.match(zhTranslations.gallery_score_upgrade_body, /鲜明风格.*剪影.*留白.*黑白/);
  assert.match(enTranslations.gallery_score_upgrade_body, /Distinctive style.*silhouettes.*negative space.*monochrome/);
  assert.match(jaTranslations.gallery_score_upgrade_body, /個性的なスタイル.*シルエット.*余白.*モノクロ/);

  for (const translations of [zhTranslations, enTranslations, jaTranslations]) {
    assert.doesNotMatch(translations.gallery_score_upgrade_body, /2026|March|3月24日|Flash|Pro|strict|厳格|更严格/);
  }
});

test('gallery upgrade copy states that free gallery re-evaluation is complete without quota charges', () => {
  assert.match(zhTranslations.gallery_score_upgrade_detail, /已完成免费重评.*不扣除账户评图额度/);
  assert.match(enTranslations.gallery_score_upgrade_detail, /completed a free re-evaluation.*no account critique quota charged/);
  assert.match(jaTranslations.gallery_score_upgrade_detail, /無料再評価が完了.*評価回数は消費していません/);
});
