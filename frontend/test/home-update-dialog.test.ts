import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestProductUpdate, getLatestProductUpdateDate, getProductUpdates, shouldShowProductUpdatePopup } from '../src/lib/updates-data.ts';
import { isUpdateNoticeRoute } from '../src/lib/update-notice.ts';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');
const dialogSource = readFileSync(
  path.join(FRONTEND_DIR, 'src', 'components', 'home', 'HomeUpdateDialog.tsx'),
  'utf8',
);
const homeSource = readFileSync(
  path.join(FRONTEND_DIR, 'src', 'components', 'home', 'HomePageClient.tsx'),
  'utf8',
);
const shellSource = readFileSync(path.join(FRONTEND_DIR, 'src/components/layout/SiteChrome.tsx'), 'utf8');

test('latest update bundle is aligned across locales for the homepage dialog', () => {
  const updates = ['zh', 'en', 'ja'].map((locale) => getLatestProductUpdate(locale as 'zh' | 'en' | 'ja'));
  assert.equal(updates.every(Boolean), true);
  assert.match(updates[0]!.id, /^\d{4}-\d{2}-\d{2}-.+/);
  assert.deepEqual(updates.map((entry) => entry!.id), Array(3).fill(updates[0]!.id));
});

test('homepage update dialog is version-scoped, dismissible and accessible', () => {
  assert.match(dialogSource, /shouldShowProductUpdatePopup\(latest\)/);
  assert.match(dialogSource, /if \(!latest \|\| !showPopup\) return/);
  assert.match(dialogSource, /picspeak:update-seen:/);
  assert.match(dialogSource, /latest\.id/);
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /event\.key === 'Escape'/);
  assert.match(dialogSource, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(dialogSource, /localStorage\.setItem/);
  assert.match(dialogSource, /\/updates#\$\{latest\.id\}/);
});

test('maintenance updates remain in the log while popup eligibility stays separate from latest-update metadata', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const updates = getProductUpdates(locale);
    const maintenance = updates.find((entry) => entry.id === '2026-09-25-gallery-actions-and-clearer-controls');
    const latest = getLatestProductUpdate(locale);
    assert.ok(latest);
    assert.ok(maintenance);
    assert.equal(maintenance.showPopup, false);
    assert.equal(shouldShowProductUpdatePopup(maintenance), false);
    assert.equal(updates[0].id, latest.id);
    assert.equal(getLatestProductUpdateDate(), latest.date);
  }
});

test('announcement popups require explicit opt-in', () => {
  const update = { id: 'feature', date: '2026-09-26', title: 'Feature', summary: 'New feature', docPath: 'docs/changelog/CHANGELOG.md#feature' };
  assert.equal(shouldShowProductUpdatePopup({ ...update, showPopup: true }), true);
  assert.equal(shouldShowProductUpdatePopup({ ...update, showPopup: false }), false);
  assert.equal(shouldShowProductUpdatePopup(update), false);
  assert.equal(shouldShowProductUpdatePopup(undefined), false);
});

test('update notice covers public entry pages without interrupting editing or depending on practice', () => {
  for (const route of ['/', '/zh', '/en/', '/ja', '/gallery', '/gallery/']) {
    assert.equal(isUpdateNoticeRoute(route), true, route);
  }
  for (const route of [null, '/workspace', '/account/reviews', '/reviews/test', '/zh/updates', '/gallery-other']) {
    assert.equal(isUpdateNoticeRoute(route), false, String(route));
  }
  assert.match(shellSource, /dynamic\(\(\) => import\('@\/components\/home\/HomeUpdateDialog'\)/);
  assert.match(shellSource, /ssr: false/);
  assert.match(shellSource, /isUpdateNoticeRoute\(pathname\) && <HomeUpdateDialog/);
  assert.doesNotMatch(homeSource, /HomeUpdateDialog/);
});
