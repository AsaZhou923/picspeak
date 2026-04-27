import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GENERATION_PROMPT_EXAMPLE_LOCALES,
  GENERATION_PROMPT_EXAMPLES,
} from '../src/content/generation/prompt-examples.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');
const VALID_TEMPLATE_KEYS = new Set([
  'custom_creation',
  'photo_inspiration',
  'social_visual',
  'portrait_avatar',
  'product_scene',
  'interior_atmosphere',
  'color_moodboard',
]);
const VALID_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);

test('curated generation prompt examples are complete and deployable', () => {
  assert.equal(GENERATION_PROMPT_EXAMPLES.length, 30);

  const ids = new Set<string>();
  const imagePaths = new Set<string>();

  for (const example of GENERATION_PROMPT_EXAMPLES) {
    assert.ok(!ids.has(example.id), `duplicate example id: ${example.id}`);
    ids.add(example.id);

    for (const locale of GENERATION_PROMPT_EXAMPLE_LOCALES) {
      assert.ok(example.title[locale].trim(), `missing ${locale} title: ${example.id}`);
      assert.ok(example.prompt[locale].trim().length >= 20, `${locale} prompt is too short: ${example.id}`);
      assert.ok(!example.prompt[locale].includes('```'), `${locale} prompt contains leaked markdown fence: ${example.id}`);
      assert.ok(!example.prompt[locale].includes('**Prompt:**'), `${locale} prompt contains leaked prompt heading: ${example.id}`);
      assert.ok(!example.prompt[locale].includes('**提示词'), `${locale} prompt contains leaked localized prompt heading: ${example.id}`);
      assert.ok(!example.prompt[locale].includes('**プロンプト'), `${locale} prompt contains leaked localized prompt heading: ${example.id}`);
    }
    assert.ok(VALID_TEMPLATE_KEYS.has(example.suggestedTemplateKey), `invalid template key: ${example.id}`);
    assert.ok(VALID_SIZES.has(example.suggestedSize), `invalid size: ${example.id}`);

    assert.match(example.imagePath, /^\/generation-prompt-examples\/[-a-z0-9]+\.jpe?g$/);
    assert.ok(!imagePaths.has(example.imagePath), `duplicate image path: ${example.imagePath}`);
    imagePaths.add(example.imagePath);

    const assetPath = path.join(FRONTEND_DIR, 'public', example.imagePath);
    assert.ok(existsSync(assetPath), `missing image asset: ${example.imagePath}`);

    assert.match(example.sourceUrl, /^https:\/\/x\.com\//);
  }
});
