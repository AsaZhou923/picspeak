import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { enTranslations } from '../src/lib/i18n-en.ts';
import type { AuthToken, ReviewGetResponse } from '../src/lib/types.ts';

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve('react')).href;
const jsxUrl = pathToFileURL(require.resolve('react/jsx-runtime')).href;
interface Harness {
  auth: { token: string | null; userInfo: AuthToken | null; isLoading: boolean };
  effects: Array<() => void | (() => void)>;
  calls: string[];
  t: (key: string) => string;
}
const globals = globalThis as typeof globalThis & { __picSpeakFeedbackHarness: Harness };

function moduleUrl(source: string, imports: Record<string, string> = {}): string {
  let code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [specifier, url] of Object.entries({ 'react/jsx-runtime': jsxUrl, ...imports })) {
    code = code.replaceAll(`from '${specifier}'`, `from ${JSON.stringify(url)}`).replaceAll(`from "${specifier}"`, `from ${JSON.stringify(url)}`);
  }
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
}

// Real React renders the actual components. Capture their mount effects for a
// small lifecycle harness, without a DOM library or a network/auth provider.
const reactHooksUrl = moduleUrl(`export { useState, useRef } from ${JSON.stringify(reactUrl)};
export function useEffect(effect) { globalThis.__picSpeakFeedbackHarness.effects.push(effect); }`);
const authUrl = moduleUrl(`export function useAuth() { return { ...globalThis.__picSpeakFeedbackHarness.auth, ensureToken: async () => { globalThis.__picSpeakFeedbackHarness.calls.push('ensureToken'); return 'guest-created'; } }; }`);
const i18nUrl = moduleUrl(`export function useI18n() { return { locale: 'en', t: globalThis.__picSpeakFeedbackHarness.t }; }`);
const clerkUrl = moduleUrl(`import { createElement } from ${JSON.stringify(reactUrl)}; export function SignInButton({ children }) { return createElement('span', { 'data-sign-in': true }, children); }`);
const apiUrl = moduleUrl(`
function record(name) { globalThis.__picSpeakFeedbackHarness.calls.push(name); }
export async function getScoreFeedback() { record('getScoreFeedback'); return { eligible: true, my_feedback: null }; }
export async function putScoreFeedback() { record('putScoreFeedback'); }
export async function getScoreFeedbackRecord() { record('getScoreFeedbackRecord'); }
export async function deleteScoreFeedback() { record('deleteScoreFeedback'); }
export async function getReview() { record('getReview'); }
export function isAbortError(error) { return error?.name === 'AbortError'; }
`);
const typesUrl = moduleUrl(await readFile(new URL('../src/lib/types.ts', import.meta.url), 'utf8'));
const scoreHelperUrl = moduleUrl(await readFile(new URL('../src/lib/score-feedback.ts', import.meta.url), 'utf8'));
const feedbackUrl = moduleUrl(await readFile(new URL('../src/features/reviews/components/ScoreFeedbackPanel.tsx', import.meta.url), 'utf8'), {
  react: reactHooksUrl,
  '@clerk/nextjs': clerkUrl,
  '@/lib/auth-context': authUrl,
  '@/lib/i18n': i18nUrl,
  '@/lib/demo-review': moduleUrl(`export function isDemoReviewId(id) { return id === 'demo'; }`),
  '@/lib/api': apiUrl,
  '@/lib/types': typesUrl,
  '@/lib/score-feedback': scoreHelperUrl,
});
const scorePanelUrl = moduleUrl(await readFile(new URL('../src/features/reviews/components/ReviewScorePanel.tsx', import.meta.url), 'utf8'), {
  'lucide-react': moduleUrl('export function TrendingDown() { return null; } export function ZoomIn() { return null; }'),
  '@/lib/i18n': i18nUrl,
  '@/lib/locale': moduleUrl(`export function localeToIntlLocale(locale) { return locale; }`),
  '@/lib/review-growth': moduleUrl(`export function getScoreVersionLabel() { return 'Rubric'; }`),
  './ScoreFeedbackPanel': feedbackUrl,
  '@/lib/review-page-copy': moduleUrl(`export const DIM_TO_TAGS = {}; export function formatExposureValue() { return ''; } export function getDimColorClass() { return ''; } export function getDimDescByType() { return 'Evidence'; } export function getDimTextClass() { return ''; }`),
});
const { ReviewScorePanel } = await import(scorePanelUrl);

const galleryReview = {
  review_id: 'gallery-review', photo_id: 'photo', photo_url: null, mode: 'flash', status: 'SUCCEEDED', image_type: 'default',
  viewer_is_owner: false, gallery_visible: false, gallery_audit_status: 'none', score_revision: 'a'.repeat(64), created_at: '2026-10-10T00:00:00Z',
  result: { scores: { composition: 7, lighting: 7, color: 7, impact: 7, technical: 7 }, final_score: 7, score_version: 'score-v8-style-relative', image_type: 'default' },
} as ReviewGetResponse;
const user: AuthToken = { user_id: 'viewer', plan: 'free', access_token: 'formal-token', token_type: 'bearer' };

async function renderAndMount(auth: Harness['auth'], review = galleryReview) {
  const harness: Harness = { auth, effects: [], calls: [], t: (key) => enTranslations[key as keyof typeof enTranslations] ?? key };
  globals.__picSpeakFeedbackHarness = harness;
  const html = renderToStaticMarkup(createElement(ReviewScorePanel, { review, activeDim: null, onDimClick: () => {}, onReviewRefresh: () => {}, sourceSurface: 'gallery' }));
  const cleanups = harness.effects.map((effect) => effect());
  await new Promise<void>((resolve) => setImmediate(resolve));
  for (const cleanup of cleanups) if (typeof cleanup === 'function') cleanup();
  return { html, calls: harness.calls };
}

test('public Gallery viewers see the three choices even when owner-only gallery fields are hidden', async () => {
  const { html, calls } = await renderAndMount({ token: user.access_token, userInfo: user, isLoading: false });
  for (const label of ['Accurate', 'Too high', 'Too low']) assert.match(html, new RegExp(`>${label}</button>`));
  assert.deepEqual(calls, ['getScoreFeedback']);
});

test('guest and signed-out mounts show sign-in only and do not create a guest or request feedback', async () => {
  for (const auth of [
    { token: 'guest-token', userInfo: { ...user, plan: 'guest' as const, access_token: 'guest-token' }, isLoading: false },
    { token: null, userInfo: null, isLoading: false },
  ]) {
    const { html, calls } = await renderAndMount(auth);
    assert.match(html, /Sign in to give feedback/);
    assert.doesNotMatch(html, />Accurate<\/button>/);
    assert.deepEqual(calls, []);
  }
});

test('missing server score revision hides the entry and makes no feedback request', async () => {
  const { html, calls } = await renderAndMount({ token: user.access_token, userInfo: user, isLoading: false }, { ...galleryReview, score_revision: null });
  assert.doesNotMatch(html, /Does this score feel accurate/);
  assert.deepEqual(calls, []);
});
