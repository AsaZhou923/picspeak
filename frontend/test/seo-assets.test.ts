import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

test('product OG image is the expected large social preview size', () => {
  const image = readFileSync(path.join(FRONTEND_DIR, 'public', 'og-product.png'));

  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('logo asset remains a square PNG suitable for metadata icons', () => {
  const image = readFileSync(path.join(FRONTEND_DIR, 'public', 'logo.png'));
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);

  assert.equal(image.toString('ascii', 1, 4), 'PNG');
  assert.equal(width, height);
  assert.ok(width >= 64);
});

test('llms.txt stays published as a plain-text discovery asset', () => {
  const llmsText = readFileSync(path.join(FRONTEND_DIR, 'public', 'llms.txt'), 'utf8');

  assert.match(llmsText, /^# PicSpeak/m);
  assert.match(llmsText, /\/generate\/prompts/);
  assert.match(llmsText, /Founder and editor:/);
});
