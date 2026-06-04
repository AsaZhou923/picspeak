import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.join(TEST_DIR, '..');

test('vendored Cormorant Garamond font exists and is valid WOFF', () => {
  const fontPath = path.join(FRONTEND_DIR, 'public', 'fonts', 'CormorantGaramond-SemiBold.woff');
  assert.ok(existsSync(fontPath), 'Cormorant Garamond WOFF font file must exist');

  const font = readFileSync(fontPath);
  assert.ok(font.byteLength > 1000, 'Font file should be substantial (>1KB)');

  const signature = font.toString('ascii', 0, 4);
  assert.equal(signature, 'wOFF', 'Font must be WOFF format (not WOFF2) for Satori compatibility');
});

test('vendored DM Sans font exists and is valid WOFF', () => {
  const fontPath = path.join(FRONTEND_DIR, 'public', 'fonts', 'DMSans-Medium.woff');
  assert.ok(existsSync(fontPath), 'DM Sans WOFF font file must exist');

  const font = readFileSync(fontPath);
  assert.ok(font.byteLength > 1000, 'Font file should be substantial (>1KB)');

  const signature = font.toString('ascii', 0, 4);
  assert.equal(signature, 'wOFF', 'Font must be WOFF format (not WOFF2) for Satori compatibility');
});

test('blog OG image size matches Open Graph recommended dimensions', async () => {
  const { blogOgSize } = await import('../src/lib/blog-og-types.ts');
  assert.equal(blogOgSize.width, 1200);
  assert.equal(blogOgSize.height, 630);
});

test('truncateBlogOgText truncates long text with ellipsis', async () => {
  const { truncateBlogOgText } = await import('../src/lib/blog-og-types.ts');

  assert.equal(truncateBlogOgText('Short title', 110), 'Short title');
  assert.equal(truncateBlogOgText('A'.repeat(200), 110), 'A'.repeat(109) + '…');
  assert.equal(truncateBlogOgText('Exactly 110 chars' + 'A'.repeat(93), 110), 'Exactly 110 chars' + 'A'.repeat(93));
});

test('blog OG font loader reads vendored fonts correctly', async () => {
  const { loadBlogOgFonts } = await import('../src/lib/blog-og-fonts.ts');

  const fonts = loadBlogOgFonts();

  assert.ok(fonts.display, 'Display font should be loaded');
  assert.ok(fonts.body, 'Body font should be loaded');
  assert.ok(fonts.display.byteLength > 1000, 'Display font should be substantial');
  assert.ok(fonts.body.byteLength > 1000, 'Body font should be substantial');

  const displayBytes = new Uint8Array(fonts.display);
  const displaySignature = String.fromCharCode(...displayBytes.slice(0, 4));
  assert.equal(displaySignature, 'wOFF', 'Display font must be WOFF format');

  const bodyBytes = new Uint8Array(fonts.body);
  const bodySignature = String.fromCharCode(...bodyBytes.slice(0, 4));
  assert.equal(bodySignature, 'wOFF', 'Body font must be WOFF format');
});

test('blog OG font loader caches fonts on subsequent calls', async () => {
  const { loadBlogOgFonts } = await import('../src/lib/blog-og-fonts.ts');

  const fonts1 = loadBlogOgFonts();
  const fonts2 = loadBlogOgFonts();

  assert.strictEqual(fonts1, fonts2, 'Font loader should return cached instance');
});
