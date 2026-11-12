import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source: string): string {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
// Execute the actual response factory, isolating only framework/auth entry points.
let source = `${await readFile('src/proxy.ts', 'utf8')}\nexport { unknownRouteResponse, isMissingPublicProfile };`;
const imports = {
  '@clerk/nextjs/server': moduleUrl('export function clerkMiddleware(callback) { return callback; }'),
  'next/server': moduleUrl('export class NextResponse extends Response {}'),
  '@/lib/locale': moduleUrl(await readFile('src/lib/locale.ts', 'utf8')),
  '@/lib/app-route-roots': moduleUrl(await readFile('src/lib/app-route-roots.ts', 'utf8')),
  '@/lib/site': moduleUrl(await readFile('src/lib/site.ts', 'utf8')),
  '@/features/profile/public-profile-metadata': moduleUrl(`
    export const lookups = [];
    export async function lookupPublicProfile(id) {
      lookups.push(id);
      return { state: id === 'upp_gone' ? 'missing' : id === 'upp_flaky' ? 'unknown' : 'found' };
    }
  `),
};
for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(`'${specifier}'`, JSON.stringify(url));
const { unknownRouteResponse, isMissingPublicProfile } = await import(moduleUrl(source));

test('all early 404 responses use a mobile viewport without losing privacy or locale recovery', async () => {
  for (const locale of ['en', 'zh', 'ja']) {
    const response = unknownRouteResponse(locale);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('cache-control'), /private, no-store/);
    assert.match(response.headers.get('x-robots-tag'), /noindex/);
    const html = await response.text();
    assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(html, new RegExp(`<html lang="${locale === 'zh' ? 'zh-CN' : locale}">`));
    assert.match(html, new RegExp(`href="/${locale}"`));
  }
});

test('document requests for a definitively missing public profile get a real 404 (#61)', async () => {
  const request = (path: string, headers: Record<string, string> = {}, method = 'GET') => ({
    method, headers: new Headers(headers), nextUrl: new URL(`https://www.picspeak.art${path}`),
  });
  assert.equal(await isMissingPublicProfile(request('/u/upp_gone')), true);
  assert.equal(await isMissingPublicProfile(request('/u/upp_gone/')), true);
  assert.equal(await isMissingPublicProfile(request('/u/upp_flaky')), false, 'an outage never becomes a 404');
  assert.equal(await isMissingPublicProfile(request('/u/upp_live')), false);
  assert.equal(await isMissingPublicProfile(request('/u/upp_gone', { rsc: '1' })), false, 'client navigations use the layout not-found UI');
  assert.equal(await isMissingPublicProfile(request('/u/upp_gone', {}, 'POST')), false);
  assert.equal(await isMissingPublicProfile(request('/gallery')), false);
  assert.equal(await isMissingPublicProfile(request('/u/%E0%A4%A')), true, 'malformed ids are not profiles');
});
