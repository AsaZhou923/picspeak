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

test('gallery upgrade copy states that free legacy re-evaluation is being prepared', () => {
  assert.match(zhTranslations.gallery_score_upgrade_detail, /暂时保留原结果.*免费统一重评方案正在准备中/);
  assert.match(enTranslations.gallery_score_upgrade_detail, /keep their current results for now.*prepare a free gallery-wide re-evaluation/);
  assert.match(jaTranslations.gallery_score_upgrade_detail, /現在の結果を一時的に保持.*無料の一括再評価を準備/);
});
