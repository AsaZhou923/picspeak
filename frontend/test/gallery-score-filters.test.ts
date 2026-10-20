import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { EMPTY_GALLERY_FILTERS, galleryFiltersFromSearchParams, toGalleryQuery, validateGalleryScores } from '../src/lib/gallery-query.ts';
import { enTranslations } from '../src/lib/i18n-en.ts';
import { zhTranslations } from '../src/lib/i18n-zh.ts';
import { jaTranslations } from '../src/lib/i18n-ja.ts';

test('score filters allow empty, one-sided, equal and inclusive decimal bounds', () => {
  for (const [minScore, maxScore] of [['', ''], ['0', ''], ['', '10'], ['0', '10'], ['7', '7'], ['7.1', '7.9'], ['10', '10']]) {
    const filters = { ...EMPTY_GALLERY_FILTERS, minScore, maxScore };
    assert.deepEqual(validateGalleryScores(filters), { minScore: null, maxScore: null, hasError: false });
    const query = toGalleryQuery(filters);
    assert.equal(query.min_score, minScore === '' ? undefined : Number(minScore));
    assert.equal(query.max_score, maxScore === '' ? undefined : Number(maxScore));
  }
});

test('reversed scores and malformed URL bounds have explicit field errors', () => {
  assert.deepEqual(validateGalleryScores({ minScore: '9', maxScore: '7' }), {
    minScore: 'filter_score_range_invalid', maxScore: 'filter_score_range_invalid', hasError: true,
  });
  for (const value of ['-0.1', '10.1', 'NaN', 'Infinity', '1e999', 'abc', ' ', '0x9']) {
    for (const field of ['minScore', 'maxScore'] as const) {
      const queryKey = field === 'minScore' ? 'min_score' : 'max_score';
      const filters = galleryFiltersFromSearchParams(new URLSearchParams({ [queryKey]: value }));
      assert.equal(validateGalleryScores(filters)[field], 'filter_score_invalid', `${field}=${value}`);
    }
  }
});

const require = createRequire(import.meta.url);
const globals = globalThis as typeof globalThis & { __galleryScoreHarness: Harness };
const reactUrl = pathToFileURL(require.resolve('react')).href;
const jsxUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;
function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [specifier, url] of Object.entries({ react: reactUrl, 'react/jsx-runtime': jsxUrl, ...imports })) {
    code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}
const dateUrl = moduleUrl(await readFile(new URL('../src/lib/date-filters.ts', import.meta.url), 'utf8'));
const queryUrl = moduleUrl(await readFile(new URL('../src/lib/gallery-query.ts', import.meta.url), 'utf8'), { './date-filters.ts': dateUrl });
const iconUrl = moduleUrl('export const CalendarDays = () => null; export const ChevronDown = CalendarDays, SlidersHorizontal = CalendarDays, Clock = CalendarDays, Star = CalendarDays, Heart = CalendarDays, Zap = CalendarDays, AlertCircle = CalendarDays, ChevronRight = CalendarDays, Info = CalendarDays, X = CalendarDays;');
const i18nUrl = moduleUrl('export function useI18n() { return { t: globalThis.__galleryScoreHarness.t, locale: "en" }; }');
const filtersUrl = moduleUrl(await readFile(new URL('../src/components/gallery/GalleryFilters.tsx', import.meta.url), 'utf8'), {
  'lucide-react': iconUrl, '@/lib/i18n': i18nUrl, '@/lib/date-filters': dateUrl,
});
const { default: GalleryFilters } = await import(filtersUrl);

test('score errors are localized, accessible and block Apply and every sort button', () => {
  for (const dictionary of [enTranslations, zhTranslations, jaTranslations]) {
    globals.__galleryScoreHarness = { t: (key: string) => dictionary[key as keyof typeof dictionary] } as Harness;
    const draftFilters = { ...EMPTY_GALLERY_FILTERS, minScore: '9', maxScore: '7' };
    const html = renderToStaticMarkup(createElement(GalleryFilters, {
      draftFilters, setDraftFilters: () => {}, onApply: () => {}, onReset: () => {}, onSortChange: () => {},
      hasInvalidDate: false, createdFromInvalid: false, createdToInvalid: false, scoreValidation: validateGalleryScores(draftFilters),
    }));
    assert.ok(html.includes(dictionary.filter_score_range_invalid));
    assert.match(html, /aria-invalid="true" aria-describedby="gallery-min-score-error"/);
    assert.match(html, /aria-invalid="true" aria-describedby="gallery-max-score-error"/);
    assert.equal((html.match(/disabled=""/g) ?? []).length, 5);
    assert.match(html, /<details[^>]*open=""/);
    assert.doesNotMatch(html, new RegExp(dictionary.gallery_err_fetch));
  }
});

type Tree = { type?: string | { name?: string }; props?: Record<string, any> };
type Hook = { value?: any; dependencies?: unknown[]; cleanup?: (() => void) | void };
interface Harness {
  cursor: number; hooks: Hook[]; effects: Array<() => void>; dirty: boolean;
  params: URLSearchParams; pushes: string[]; calls: Array<Record<string, unknown>>; saved: string[]; tree: Tree;
  t: (key: string) => string; respond: (query: Record<string, unknown>) => Promise<any>;
}
// Dependency-aware hooks run the real page through edits, navigation and async
// completions, without adding a DOM/test-renderer dependency to the application.
const hooksUrl = moduleUrl(`
const current = () => globalThis.__galleryScoreHarness;
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
export function useState(initial) {
  const h = current(), index = h.cursor++;
  if (!h.hooks[index]) h.hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
  return [h.hooks[index].value, (next) => {
    const value = typeof next === 'function' ? next(h.hooks[index].value) : next;
    if (!Object.is(value, h.hooks[index].value)) { h.hooks[index].value = value; h.dirty = true; }
  }];
}
export function useRef(initial) { return useState(() => ({ current: initial }))[0]; }
export function useMemo(factory, dependencies) {
  const h = current(), index = h.cursor++, old = h.hooks[index];
  if (!old || !same(old.dependencies, dependencies)) h.hooks[index] = { value: factory(), dependencies };
  return h.hooks[index].value;
}
export function useCallback(callback, dependencies) { return useMemo(() => callback, dependencies); }
export function useEffect(effect, dependencies) {
  const h = current(), index = h.cursor++, old = h.hooks[index];
  if (!old || !same(old.dependencies, dependencies)) {
    const hook = { dependencies }; h.hooks[index] = hook;
    h.effects.push(() => { old?.cleanup?.(); hook.cleanup = effect(); });
  }
}
export function Suspense() {}
`);
const fakeJsxUrl = moduleUrl('export function jsx(type, props) { return { type, props }; } export const jsxs = jsx; export const Fragment = "fragment";');
const stub = (name: string) => moduleUrl(`export default function ${name}() { return null; }`);
const pageUrl = moduleUrl(`${await readFile(new URL('../src/app/gallery/GalleryClientPage.tsx', import.meta.url), 'utf8')}\nexport { GalleryPageContent };`, {
  react: hooksUrl, 'react/jsx-runtime': fakeJsxUrl, 'lucide-react': iconUrl, 'next/link': stub('Link'),
  'next/navigation': moduleUrl('export function useSearchParams() { return globalThis.__galleryScoreHarness.params; } export function useRouter() { return { push(href) { const h = globalThis.__galleryScoreHarness; h.pushes.push(href); h.params = new URLSearchParams(href.split("?")[1]); h.dirty = true; } }; }'),
  '@/components/auth/ClerkSignInTrigger': stub('ClerkSignInTrigger'), '@/components/marketing/ProPromoCard': stub('ProPromoCard'),
  '@/lib/api': moduleUrl('export function getPublicGallery(query) { const h = globalThis.__galleryScoreHarness; h.calls.push(query); return h.respond(query); } export async function likeGalleryReview() {} export async function unlikeGalleryReview() {}'),
  '@/lib/auth-context': moduleUrl('export function useAuth() { return { token: null, userInfo: null, ensureToken: async () => "", isLoading: false }; }'),
  '@/lib/error-utils': moduleUrl('export function formatUserFacingError(t, error, fallback) { return fallback; }'),
  '@/lib/gallery-navigation': moduleUrl('export function buildGalleryRestoreKey(query) { return query ? "/gallery?" + query : "/gallery"; } export function readGalleryRestoreState() { return null; } export function saveGalleryRestoreState(key) { globalThis.__galleryScoreHarness.saved.push(key); }'),
  '@/lib/content-conversion': moduleUrl('export function buildWorkspaceConversionHref() { return "/workspace"; }'), '@/lib/i18n': i18nUrl,
  '@/lib/product-analytics': moduleUrl('export function markProductAttributionSource() {} export function trackProductEvent() {}'), '@/lib/date-filters': dateUrl,
  '@/lib/locale': moduleUrl('export function localeToIntlLocale() { return "en-US"; }'),
  '@/lib/hooks/useModalFocusTrap': moduleUrl('export function useModalFocusTrap() { return { current: null }; }'),
  '@/lib/gallery-preferences': moduleUrl('export function galleryGridClassName() { return "grid-cols-1"; } export function readGalleryPreferences() { return { columns: "auto", density: "full" }; } export function sanitizeGalleryPreferences() { return { columns: "auto", density: "full" }; } export function writeGalleryPreferences() {}'),
  '@/lib/gallery-query': queryUrl,
  ...Object.fromEntries(['GalleryFilters', 'GalleryPagination', 'GalleryCard', 'GalleryScoreboard', 'GalleryViewControls'].map((name) => [`@/components/gallery/${name}`, stub(name)])),
});
const { GalleryPageContent } = await import(pageUrl);
const oldWindow = globalThis.window;
globalThis.window = { scrollY: 0, addEventListener() {}, removeEventListener() {}, cancelAnimationFrame() {} } as unknown as Window & typeof globalThis;
after(() => {
  if (oldWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else globalThis.window = oldWindow;
});
function find(tree: any, predicate: (node: Tree) => boolean): Tree | undefined {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) {
    for (const child of tree) { const result = find(child, predicate); if (result) return result; }
    return;
  }
  if (predicate(tree)) return tree;
  return find(tree.props?.children, predicate);
}
function component(h: Harness, name: string) {
  const node = find(h.tree, (node) => typeof node.type !== 'string' && node.type?.name === name);
  assert.ok(node, `${name} must be rendered`); return node.props!;
}
function createHarness(query = ''): Harness {
  return { cursor: 0, hooks: [], effects: [], dirty: true, params: new URLSearchParams(query), pushes: [], calls: [], saved: [], tree: {},
    t: (key) => enTranslations[key as keyof typeof enTranslations] ?? key,
    respond: async () => ({ items: [{ review_id: 'existing-work' }], total_count: 13, next_cursor: 'page-two' }),
  };
}
async function flush(h: Harness) {
  globals.__galleryScoreHarness = h;
  for (let pass = 0; pass < 20; pass++) {
    if (h.dirty) {
      h.dirty = false; h.cursor = 0; h.tree = GalleryPageContent();
      const effects = h.effects.splice(0); for (const effect of effects) effect();
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (!h.dirty) return;
  }
  assert.fail('Gallery did not settle');
}
async function edit(h: Harness, changes: Record<string, string>) {
  component(h, 'GalleryFilters').setDraftFilters((draft: object) => ({ ...draft, ...changes })); await flush(h);
}
async function navigate(h: Harness, query: string) { h.params = new URLSearchParams(query); h.dirty = true; await flush(h); }

test('Apply and sort preserve loaded works for invalid drafts, then recover repeatedly', async () => {
  const h = createHarness(); await flush(h);
  for (let attempt = 0; attempt < 2; attempt++) {
    await edit(h, { minScore: '9', maxScore: '7' });
    const before = h.calls.length, pushes = h.pushes.length;
    component(h, 'GalleryFilters').onApply(); component(h, 'GalleryFilters').onSortChange('score'); await flush(h);
    assert.equal(h.calls.length, before); assert.equal(h.pushes.length, pushes);
    assert.equal(component(h, 'GalleryCard').item.review_id, 'existing-work');
    assert.equal(component(h, 'GalleryFilters').scoreValidation.minScore, 'filter_score_range_invalid');
    await edit(h, { minScore: '7' }); component(h, 'GalleryFilters').onApply(); await flush(h);
    assert.equal(h.calls.at(-1)?.min_score, 7); assert.equal(h.calls.at(-1)?.max_score, 7);
    component(h, 'GalleryFilters').onReset(); await flush(h);
    assert.equal(h.params.toString(), ''); assert.equal(component(h, 'GalleryFilters').scoreValidation.hasError, false);
  }
});

test('invalid URL scores show a correctable filter alert without fetching or claiming an empty gallery', async () => {
  for (const query of ['min_score=9&max_score=7', 'min_score=11', 'max_score=NaN']) {
    const h = createHarness(query); await flush(h);
    assert.deepEqual(h.calls, []); assert.ok(find(h.tree, (node) => node.props?.role === 'alert'));
    assert.ok(JSON.stringify(h.tree).includes(enTranslations.gallery_filter_score_error));
    assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_empty_body));
    assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_err_fetch));
    assert.equal(component(h, 'GalleryFilters').scoreValidation.hasError, true);
    component(h, 'GalleryFilters').onReset(); await flush(h);
    assert.equal(h.calls.length, 1); assert.equal(component(h, 'GalleryFilters').scoreValidation.hasError, false);
  }
});

test('URL navigation preserves works, review context and restore keys, and correction resumes loading', async () => {
  const h = createHarness('min_score=6&sort=latest'); await flush(h);
  await navigate(h, 'min_score=9&max_score=7&restore=1');
  assert.equal(h.calls.length, 1); assert.equal(component(h, 'GalleryCard').item.review_id, 'existing-work');
  assert.equal(component(h, 'GalleryCard').backHref, '/gallery?min_score=6&sort=latest&restore=1');
  assert.equal(component(h, 'GalleryCard').galleryQuery, 'min_score=6&sort=latest');
  assert.equal(component(h, 'GalleryPagination').disabled, true);
  assert.equal(component(h, 'GalleryPagination').paging, false);
  await component(h, 'GalleryPagination').goToPage(1); await flush(h);
  assert.equal(h.calls.length, 1); assert.ok(h.saved.every((key) => !key.includes('min_score=9')));
  await edit(h, { minScore: '6', maxScore: '8' }); component(h, 'GalleryFilters').onApply(); await flush(h);
  assert.equal(h.calls.length, 2); assert.equal(h.calls.at(-1)?.max_score, 8);
  assert.equal(component(h, 'GalleryPagination').disabled, false);
  await navigate(h, 'min_score=6&sort=latest');
  assert.equal(component(h, 'GalleryFilters').draftFilters.minScore, '6'); assert.equal(component(h, 'GalleryFilters').draftFilters.maxScore, '');
});

test('real request failures still expose Retry, separate from invalid-filter correction', async () => {
  const h = createHarness(); h.respond = async () => { throw new Error('offline'); }; await flush(h);
  assert.ok(JSON.stringify(h.tree).includes(enTranslations.gallery_err_fetch));
  assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_filter_score_error));
  const retry = find(h.tree, (node) => node.type === 'button' && node.props?.children === enTranslations.app_error_retry); assert.ok(retry);
  h.respond = async () => ({ items: [{ review_id: 'recovered-work' }], total_count: 1, next_cursor: null });
  retry.props!.onClick(); await flush(h); assert.equal(component(h, 'GalleryCard').item.review_id, 'recovered-work');
});

test('pagination finishing after invalid-URL navigation cannot overwrite corrected results', async () => {
  for (const fails of [false, true]) {
    const h = createHarness(); await flush(h);
    let resolvePage!: (value: unknown) => void;
    let rejectPage!: (error: Error) => void;
    const oldPage = new Promise((resolve, reject) => { resolvePage = resolve; rejectPage = reject; });
    h.respond = (query) => query.cursor ? oldPage : Promise.resolve({ items: [{ review_id: 'corrected-work' }], total_count: 1, next_cursor: null });
    const paging = component(h, 'GalleryPagination').goToPage(1);
    await flush(h);
    assert.equal(component(h, 'GalleryPagination').paging, true);
    await navigate(h, 'min_score=9&max_score=7');
    await edit(h, { minScore: '6' }); component(h, 'GalleryFilters').onApply(); await flush(h);
    assert.equal(component(h, 'GalleryCard').item.review_id, 'corrected-work');
    if (fails) rejectPage(new Error('old request failed'));
    else resolvePage({ items: [{ review_id: 'stale-work' }], total_count: 13, next_cursor: null });
    await paging; await flush(h);
    assert.equal(component(h, 'GalleryCard').item.review_id, 'corrected-work');
    assert.equal(component(h, 'GalleryPagination').pageIndex, 0);
    assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_err_fetch));
  }
});

for (const fails of [false, true]) {
  test(`invalid URL restores the settled page through an interrupted valid load (${fails ? 'late failure' : 'late success'})`, async () => {
    const h = createHarness('min_score=6&sort=latest');
    h.respond = async (query) => ({ items: [{ review_id: query.cursor ? 'second-page-work' : 'first-page-work' }], total_count: 25, next_cursor: query.cursor ? 'page-three' : 'page-two' });
    await flush(h);
    await component(h, 'GalleryPagination').goToPage(1); await flush(h);
    assert.equal(component(h, 'GalleryPagination').pageIndex, 1);
    let resolveLoad!: (value: unknown) => void;
    let rejectLoad!: (error: Error) => void;
    h.respond = () => new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    await navigate(h, 'min_score=8&sort=latest');
    assert.ok(!find(h.tree, (node) => typeof node.type !== 'string' && node.type?.name === 'GalleryCard'));
    await navigate(h, 'min_score=9&max_score=7');
    assert.equal(component(h, 'GalleryCard').item.review_id, 'second-page-work');
    assert.equal(component(h, 'GalleryPagination').pageIndex, 1);
    assert.equal(component(h, 'GalleryPagination').totalCount, 25);
    assert.equal(component(h, 'GalleryCard').backHref, '/gallery?min_score=6&sort=latest&restore=1');
    assert.equal(component(h, 'GalleryCard').galleryQuery, 'min_score=6&sort=latest');
    assert.equal(component(h, 'GalleryPagination').disabled, true);
    assert.equal(h.calls.length, 3);
    if (fails) rejectLoad(new Error('cancelled query failed'));
    else resolveLoad({ items: [{ review_id: 'stale-filter-work' }], total_count: 1, next_cursor: null });
    await flush(h);
    assert.equal(component(h, 'GalleryCard').item.review_id, 'second-page-work');
    assert.equal(component(h, 'GalleryPagination').pageIndex, 1);
    assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_err_fetch));
    assert.ok(h.saved.every((key) => !key.includes('min_score=9')));
  });
}

test('a new valid query failure retains the existing failure-and-Retry semantics', async () => {
  const h = createHarness('min_score=6'); await flush(h);
  h.respond = async () => { throw new Error('new valid query failed'); };
  await navigate(h, 'min_score=8');
  assert.ok(!find(h.tree, (node) => typeof node.type !== 'string' && node.type?.name === 'GalleryCard'));
  assert.ok(JSON.stringify(h.tree).includes(enTranslations.gallery_err_fetch));
  assert.ok(find(h.tree, (node) => node.type === 'button' && node.props?.children === enTranslations.app_error_retry));
  assert.ok(!JSON.stringify(h.tree).includes(enTranslations.gallery_filter_score_error));
});
