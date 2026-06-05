import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDemoReviewJsonLd,
  DEMO_IMAGE_FALLBACK_URL,
  DEMO_REVIEW_ID,
  DEMO_REVIEW_RATING_VALUE,
} from '../src/lib/demo-review.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));

test('demo critique fallback image matches the ginkgo review', () => {
  assert.match(DEMO_IMAGE_FALLBACK_URL, /obj_4fea1f667283448c\.jpg$/);
  assert.doesNotMatch(DEMO_IMAGE_FALLBACK_URL, /photo-soft-airy-35mm/);
});

test('demo critique exposes Review JSON-LD with a CreativeWork target and rating', () => {
  const schema = buildDemoReviewJsonLd({
    site: {
      name: 'PicSpeak',
      url: 'https://picspeak.art',
      logoImage: '/logo.png',
    },
    title: 'AI Photo Critique Example',
    description: 'Public PicSpeak example with concrete photo critique suggestions.',
    locale: 'en',
    imageAlt: enTranslations.demo_image_alt,
    advantage: enTranslations.demo_review_advantage,
    critique: enTranslations.demo_review_critique,
    suggestions: enTranslations.demo_review_suggestions,
  });

  assert.equal(schema['@type'], 'Review');
  assert.equal(schema.url, `https://picspeak.art/reviews/${DEMO_REVIEW_ID}`);
  assert.equal(schema.itemReviewed['@type'], 'CreativeWork');
  assert.equal(schema.itemReviewed.image.url, DEMO_IMAGE_FALLBACK_URL);
  assert.equal(schema.reviewRating['@type'], 'Rating');
  assert.equal(schema.reviewRating.ratingValue, DEMO_REVIEW_RATING_VALUE);
  assert.equal(schema.reviewRating.bestRating, 10);
  assert.match(schema.reviewBody, /Golden ginkgo/);
});

test('demo critique JSON-LD can target any public demo review id', () => {
  const schema = buildDemoReviewJsonLd({
    site: {
      name: 'PicSpeak',
      url: 'https://picspeak.art',
      logoImage: '/logo.png',
    },
    reviewId: 'rev_35e0951d0df94a1e',
    title: 'AI Photo Critique Example',
    description: 'Public PicSpeak example with concrete photo critique suggestions.',
    locale: 'en',
    imageAlt: enTranslations.demo_image_alt,
    advantage: enTranslations.demo_review_advantage,
    critique: enTranslations.demo_review_critique,
    suggestions: enTranslations.demo_review_suggestions,
  });

  assert.equal(schema.url, 'https://picspeak.art/reviews/rev_35e0951d0df94a1e');
  assert.equal(schema.itemReviewed.url, 'https://picspeak.art/reviews/rev_35e0951d0df94a1e');
});

test('demo review route emits the structured data helper for public rich results', () => {
  const layoutSource = readFileSync(
    path.join(TEST_DIR, '..', 'src', 'app', 'reviews', '[reviewId]', 'layout.tsx'),
    'utf8',
  );

  assert.match(layoutSource, /buildDemoReviewJsonLd/);
  assert.match(layoutSource, /picspeak-demo-review-structured-data/);
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
