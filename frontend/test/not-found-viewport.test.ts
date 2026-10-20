import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

function moduleUrl(source: string): string {
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
// Execute the actual response factory, isolating only framework/auth entry points.
let source = `${await readFile('src/proxy.ts', 'utf8')}\nexport { unknownRouteResponse };`;
const imports = {
  '@clerk/nextjs/server': moduleUrl('export function clerkMiddleware(callback) { return callback; }'),
  'next/server': moduleUrl('export class NextResponse extends Response {}'),
  '@/lib/locale': moduleUrl(await readFile('src/lib/locale.ts', 'utf8')),
  '@/lib/app-route-roots': moduleUrl(await readFile('src/lib/app-route-roots.ts', 'utf8')),
  '@/lib/site': moduleUrl(await readFile('src/lib/site.ts', 'utf8')),
};
for (const [specifier, url] of Object.entries(imports)) source = source.replaceAll(`'${specifier}'`, JSON.stringify(url));
const { unknownRouteResponse } = await import(moduleUrl(source));

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
