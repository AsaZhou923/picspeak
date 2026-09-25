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
