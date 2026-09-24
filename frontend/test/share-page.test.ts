import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('shared review 404 uses revoked-link copy instead of generic retry support text', async () => {
  const source = await readFile('src/app/share/[shareToken]/page.tsx', 'utf8');

  assert.match(source, /err instanceof ApiException && err\.status === 404/);
  assert.match(source, /分享链接已失效/);
  assert.match(source, /已过期或已被所有者撤销/);
  assert.match(source, /This share link is no longer available/);
  assert.match(source, /expired or was revoked by the owner/);
  assert.match(source, /共有リンクは無効です/);
  assert.match(source, /所有者によって取り消されました/);
  assert.match(source, /formatUserFacingError\(t, err, t\('review_err_fetch'\)\)/);
  assert.match(source, /href="\/workspace"/);
});
