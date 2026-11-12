import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProfileApiUrl } from '../src/features/profile/api.ts';
import { getProfileCopy } from '../src/features/profile/profile-copy.ts';

test('profile api helper targets the dedicated profiles surface', () => {
  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test/root/api';

  assert.equal(
    buildProfileApiUrl('/profiles/upp_public?limit=12'),
    'https://api.example.test/root/api/v1/profiles/upp_public?limit=12'
  );
});

test('profile copy is local to the feature and covers three languages', () => {
  assert.equal(getProfileCopy('zh').enable, '发布公开主页');
  assert.equal(getProfileCopy('en').enable, 'Enable public profile');
  assert.equal(getProfileCopy('ja').enable, 'プロフィールを公開');
});

test('public profile page does not render notes, tags, exif, clerk, email or internal user ids', async () => {
  const [page, helper] = await Promise.all([
    readFile('src/app/u/[publicProfileId]/page.tsx', 'utf8'),
    readFile('src/features/profile/api.ts', 'utf8'),
  ]);

  assert.doesNotMatch(page, /note|tags|exif|clerk|email|owner_user_id|user_id/i);
  assert.doesNotMatch(helper, /clerk|email|owner_user_id/i);
  assert.match(page, /getPublicProfile\(publicProfileId,/);
  assert.match(helper, /cache: 'no-store'/);
});

test('account profile page uses an explicit owner toggle before publishing', async () => {
  const [accountSource, publicSource] = await Promise.all([
    readFile('src/app/account/profile/page.tsx', 'utf8'),
    readFile('src/app/u/[publicProfileId]/page.tsx', 'utf8'),
  ]);

  assert.match(accountSource, /updateMyProfileSettings\(token, enabled\)/);
  assert.match(accountSource, /settings\?\.public_profile_enabled/);
  assert.doesNotMatch(accountSource, /automatically publish|auto publish/i);
  assert.doesNotMatch(accountSource, /<main[\s>]/);
  assert.doesNotMatch(publicSource, /<main[\s>]/);
});

test('profile pages support stale-request cancellation, pagination and clipboard failure feedback', async () => {
  const [accountSource, publicSource, copySource] = await Promise.all([
    readFile('src/app/account/profile/page.tsx', 'utf8'),
    readFile('src/app/u/[publicProfileId]/page.tsx', 'utf8'),
    readFile('src/features/profile/profile-copy.ts', 'utf8'),
  ]);

  assert.match(accountSource, /new AbortController\(\)/);
  assert.match(accountSource, /controller\.abort\(\)/);
  assert.match(accountSource, /copy\.copyFailed/);
  assert.match(publicSource, /new AbortController\(\)/);
  assert.match(publicSource, /profile\?\.next_cursor/);
  assert.match(publicSource, /copy\.loadMore/);
  assert.match(publicSource, /profile\.total_like_count/);
  assert.match(copySource, /copyFailed/);
});

test('public profile metadata gives real profiles their own canonical and keeps unresolved ones out of the index (#61)', async () => {
  const { buildPublicProfileMetadata, lookupPublicProfile } = await import('../src/features/profile/public-profile-metadata.ts');
  const profile = {
    public_profile_id: 'upp_abc',
    username: 'Mira',
    avatar_url: null,
    gallery_review_count: 3,
    total_like_count: 1,
    items: [],
    next_cursor: null,
  };
  const found = buildPublicProfileMetadata({ state: 'found', profile }, 'en');
  assert.equal(found.alternates?.canonical, '/u/upp_abc');
  assert.equal((found.robots as { index?: boolean }).index, true);
  assert.match(String(found.title), /^Mira/);
  assert.doesNotMatch(String(found.title), /PicSpeak/, 'the root title template appends the brand');
  assert.match(String(found.description), /3 public Gallery photos/);

  for (const state of ['missing', 'unknown'] as const) {
    const metadata = buildPublicProfileMetadata({ state }, 'zh');
    assert.equal(metadata.alternates, null, `${state} profile must not inherit the homepage canonical`);
    assert.equal((metadata.robots as { index?: boolean }).index, false);
  }

  process.env.NEXT_PUBLIC_API_URL = 'https://api.example.test';
  const originalFetch = globalThis.fetch;
  const respond = (status: number, body: unknown = {}) => {
    globalThis.fetch = (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
  };
  try {
    respond(404, { error: { code: 'PUBLIC_PROFILE_NOT_FOUND' } });
    assert.deepEqual(await lookupPublicProfile('upp_gone'), { state: 'missing' });
    respond(503);
    assert.deepEqual(await lookupPublicProfile('upp_flaky'), { state: 'unknown' }, 'an outage is not a 404');
    globalThis.fetch = (async () => { throw new TypeError('network'); }) as typeof fetch;
    assert.deepEqual(await lookupPublicProfile('upp_offline'), { state: 'unknown' });
    respond(200, profile);
    assert.deepEqual(await lookupPublicProfile('upp_abc'), { state: 'found', profile });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('public profile layout returns a real 404 for missing profiles and the page separates missing from temporary failures (#61)', async () => {
  const [layout, page] = await Promise.all([
    readFile('src/app/u/[publicProfileId]/layout.tsx', 'utf8'),
    readFile('src/app/u/[publicProfileId]/page.tsx', 'utf8'),
  ]);
  assert.match(layout, /export async function generateMetadata/);
  assert.match(layout, /lookup\.state === 'missing'\) notFound\(\)/);
  assert.match(page, /status === 404/);
  assert.match(page, /copy\.notFoundBody/);
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const copy = getProfileCopy(locale);
    assert.notEqual(copy.notFound, copy.unavailable);
    assert.notEqual(copy.unavailable, copy.unavailableBody, 'heading and body are not the same sentence');
  }
});

test('noindex share pages do not inherit the homepage canonical (#61)', async () => {
  const shareLayout = await readFile('src/app/share/[shareToken]/layout.tsx', 'utf8');
  assert.match(shareLayout, /alternates: null/);
  assert.match(shareLayout, /robots: NO_INDEX_ROBOTS/);
});
