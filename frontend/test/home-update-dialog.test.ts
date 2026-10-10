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

test('Gallery browsing update is the latest visible update without popup', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const latest = getLatestProductUpdate(locale);
    assert.ok(latest);
    assert.equal(latest.id, '2026-10-10-gallery-browsing');
    assert.equal(latest.date, '2026-10-10');
    assert.equal(latest.showPopup, false);
    assert.equal(shouldShowProductUpdatePopup(latest), false);
    assert.equal(latest.docPath, `docs/changelog/CHANGELOG.md#${latest.id}`);
  }
  assert.equal(getLatestProductUpdateDate('zh'), '2026-10-10');
  assert.equal(getLatestProductUpdateDate(), '2026-10-10');
});

test('Sol rollout keeps the pricing notice popup opt-in only for Chinese users', () => {
  const announcement = getProductUpdates('zh').find((entry) => entry.id === '2026-10-09-gpt6-sol-review-rollout');
  assert.ok(announcement);
  assert.equal(announcement.date, '2026-10-09');
  assert.equal(shouldShowProductUpdatePopup(announcement), true);
  assert.equal(announcement.docPath, `docs/changelog/CHANGELOG.md#${announcement.id}`);
  assert.match(announcement.summary, /自 10 月 10 日 00:00 起/);
  assert.match(announcement.summary, /Flash 使用 GPT-6 Sol/);
  assert.match(announcement.summary, /Pro 使用更强的 GPT-6\.1 Sol/);
  assert.doesNotMatch(announcement.summary, /推理强度|\b(?:low|light|high|xhigh)\b/);
  assert.match(announcement.summary, /GPT-6 Sol/);
  assert.match(announcement.summary, /此前 1\.99 美元的优惠/);
  assert.match(announcement.summary, /3\.99 美元\/月订阅，按月自动续费，可随时取消/);
  assert.match(announcement.summary, /现有 Pro 用户不受本次价格调整影响/);

  for (const locale of ['en', 'ja'] as const) {
    const rollout: ReturnType<typeof getProductUpdates>[number] | undefined = getProductUpdates(locale).find((entry) => entry.id === announcement.id);
    assert.ok(rollout);
    assert.equal(rollout.date, '2026-10-09');
    assert.equal(shouldShowProductUpdatePopup(rollout), false);
    assert.doesNotMatch(rollout.summary, /1\.99|3\.99|10 月 10 日/);
    assert.equal(getProductUpdates(locale).some((entry) => entry.id === '2026-10-08-gpt6-sol-and-pro-pricing'), false);
  }
});

test('Free history change is recorded in every locale while preserving the Chinese announcement priority', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const latest = getLatestProductUpdate(locale);
    const pending = getProductUpdates(locale).find((entry) => entry.id === '2026-10-08-free-history-fifteen-days');
    assert.ok(latest);
    assert.ok(pending);
    assert.equal(latest.id, '2026-10-10-gallery-browsing');
    assert.equal(latest.date, '2026-10-10');
    assert.equal(pending.showPopup, false);
    assert.match(pending.summary, /15/);
    assert.equal(shouldShowProductUpdatePopup(pending), false);
    assert.equal(shouldShowProductUpdatePopup(latest), false);
  }
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
  assert.match(dialogSource, /latest\.primaryAction/);
  assert.match(dialogSource, /latest\.primaryAction\.href/);
  assert.match(dialogSource, /onClick=\{dismiss\}/);
  assert.match(dialogSource, /latest\.sections\.length <= 2 \? 'md:grid-cols-2' : 'md:grid-cols-3'/);
});

test('maintenance updates remain in the log while popup eligibility stays separate from latest-update metadata', () => {
  for (const locale of ['zh', 'en', 'ja'] as const) {
    const updates = getProductUpdates(locale);
    const maintenance = updates.find((entry) => entry.id === '2026-09-25-gallery-actions-and-clearer-controls');
    const previousSameDay = updates.find((entry) => entry.id === '2026-10-02-photo-scoring-quality');
    const latestMaintenance = updates.find((entry) => entry.id === '2026-10-07-review-reliability-and-gallery');
    const latest = getLatestProductUpdate(locale);
    assert.ok(latest);
    assert.ok(maintenance);
    assert.ok(previousSameDay);
    assert.ok(latestMaintenance);
    assert.equal(maintenance.showPopup, false);
    assert.equal(previousSameDay.showPopup, false);
    assert.equal(shouldShowProductUpdatePopup(maintenance), false);
    assert.equal(shouldShowProductUpdatePopup(previousSameDay), false);
    assert.equal(updates[0].id, latest.id);
    assert.equal(shouldShowProductUpdatePopup(latestMaintenance), false);
    assert.equal(shouldShowProductUpdatePopup(latest), false);
    const previousAnnouncement = updates.find((entry) => entry.id === '2026-10-06-photo-rubric-and-gallery-reassessment');
    assert.ok(previousAnnouncement);
    assert.equal(shouldShowProductUpdatePopup(previousAnnouncement), true);
    assert.equal(getLatestProductUpdateDate(locale), latest.date);
  }
});

test('product update data clones nested actions and section items for callers', () => {
  const firstRead = getProductUpdates('en');
  const actionEntry = firstRead.find((entry) => entry.primaryAction);
  assert.ok(actionEntry);
  const originalLabel = actionEntry.primaryAction!.label;
  const sectionEntry = firstRead.find((entry) => entry.sections?.length);
  assert.ok(sectionEntry);
  const originalItem = sectionEntry.sections![0].items[0];
  actionEntry.primaryAction!.label = 'Mutated action';
  sectionEntry.sections![0].items[0] = 'Mutated item';

  const secondRead = getProductUpdates('en');
  assert.equal(secondRead.find((entry) => entry.id === actionEntry.id)!.primaryAction!.label, originalLabel);
  assert.equal(
    secondRead.find((entry) => entry.id === sectionEntry.id)!.sections![0].items[0],
    originalItem,
  );
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
