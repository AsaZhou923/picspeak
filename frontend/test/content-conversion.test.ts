import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildWorkspaceConversionHref,
  getBlogWorkspaceCta,
  getGalleryWorkspaceCtas,
  getHomeIntentEntrances,
} from '../src/lib/content-conversion.ts';
import type { PublicGalleryItem } from '../src/lib/types.ts';

test('blog CTA maps article topic to a same-critique workspace entry', () => {
  const cta = getBlogWorkspaceCta('zh', {
    slug: 'five-photo-composition-checks',
    category: '构图',
  });

  assert.equal(cta.primaryCta, '立即试试同类点评');
  assert.match(cta.title, /构图/);
  assert.match(cta.href, /^\/workspace\?/);
  assert.match(cta.href, /source=blog/);
  assert.match(cta.href, /entrypoint=blog_same_critique/);
  assert.match(cta.href, /content_slug=five-photo-composition-checks/);
  assert.match(cta.href, /image_type=default/);
});

test('blog CTA preserves specific shooting types when the article has one', () => {
  const cta = getBlogWorkspaceCta('en', {
    slug: 'street-photography-ai-review-workflow',
    category: 'Street',
  });

  assert.equal(cta.imageType, 'street');
  assert.match(cta.href, /image_type=street/);
  assert.match(cta.body, /street/i);
});

test('gallery CTA creates practice and score-standard workspace entries', () => {
  const item: PublicGalleryItem = {
    review_id: 'rev_gallery_1',
    photo_id: 'photo_1',
    photo_url: null,
    mode: 'flash',
    image_type: 'portrait',
    final_score: 8.2,
    score_version: 'v1',
    summary: 'Clean portrait lighting with a stronger subject separation.',
    owner_username: 'Ada',
    owner_avatar_url: null,
    like_count: 4,
    liked_by_viewer: false,
    recommended: true,
    score_percentile: null,
    gallery_added_at: '2026-04-24T00:00:00Z',
    created_at: '2026-04-24T00:00:00Z',
  };

  const ctas = getGalleryWorkspaceCtas('zh', item);

  assert.match(ctas.practice.title, /同题材/);
  assert.equal(ctas.standard.cta, '用这套标准点评我的照片');
  assert.match(ctas.practice.href, /entrypoint=gallery_practice/);
  assert.match(ctas.standard.href, /entrypoint=gallery_score_standard/);
  assert.match(ctas.standard.href, /gallery_review_id=rev_gallery_1/);
  assert.match(ctas.standard.href, /image_type=portrait/);
});

test('home intent entrances split new, returning, and content traffic paths', () => {
  const entrances = getHomeIntentEntrances('zh');

  assert.deepEqual(
    entrances.map((entry) => entry.intent),
    ['new_user', 'returning_user', 'content_reader'],
  );
  assert.match(entrances[0].href, /entrypoint=home_new_user/);
  assert.equal(entrances[1].href, '/account/reviews');
  assert.match(entrances[2].href, /source=blog/);
  assert.match(entrances[2].href, /entrypoint=home_content_reader/);
});

test('workspace conversion href omits empty optional fields', () => {
  const href = buildWorkspaceConversionHref({
    source: 'blog',
    entrypoint: 'blog_same_critique',
    imageType: 'street',
    contentSlug: '',
  });

  assert.equal(href, '/workspace?source=blog&entrypoint=blog_same_critique&image_type=street');
});
