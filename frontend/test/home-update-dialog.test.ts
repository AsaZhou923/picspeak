import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLatestProductUpdate } from '../src/lib/updates-data.ts';

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

test('latest update bundle is aligned across locales for the homepage dialog', () => {
  const updates = ['zh', 'en', 'ja'].map((locale) => getLatestProductUpdate(locale as 'zh' | 'en' | 'ja'));
  assert.equal(updates.every(Boolean), true);
  assert.match(updates[0]!.id, /^\d{4}-\d{2}-\d{2}-.+/);
  assert.deepEqual(updates.map((entry) => entry!.id), Array(3).fill(updates[0]!.id));
});

test('homepage update dialog is version-scoped, dismissible and accessible', () => {
  assert.match(dialogSource, /picspeak:update-seen:/);
  assert.match(dialogSource, /latest\.id/);
  assert.match(dialogSource, /role="dialog"/);
  assert.match(dialogSource, /aria-modal="true"/);
  assert.match(dialogSource, /event\.key === 'Escape'/);
  assert.match(dialogSource, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(dialogSource, /localStorage\.setItem/);
  assert.match(dialogSource, /\/updates#\$\{latest\.id\}/);
});

test('homepage loads the update dialog as a client-only enhancement', () => {
  assert.match(homeSource, /dynamic\(\(\) => import\('@\/components\/home\/HomeUpdateDialog'\)/);
  assert.match(homeSource, /ssr: false/);
  assert.match(homeSource, /<HomeUpdateDialog \/>/);
});
