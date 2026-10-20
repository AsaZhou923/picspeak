import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';

const item = (id: string) => ({ review_id: id, photo_id: `photo-${id}`, created_at: '2026-10-20T00:00:00Z', image_type: 'landscape', final_score: 7.4, status: 'SUCCEEDED', mode: 'flash', tags: [], note: '' });
const authFor = (id: string) => ({ userInfo: { user_id: id, plan: 'free', access_token: `${id}-token` }, isLoading: false, ensureToken: async () => `${id}-token` });
function history(api: Record<string, any>) {
  let auth = authFor('owner');
  const params = new URLSearchParams();
  const app = componentHarness(new URL('../src/app/account/reviews/page.tsx', import.meta.url), {
    'next/link': { default: 'Link' }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ replace() {} }), usePathname: () => '/account/reviews', useSearchParams: () => params },
    '@/lib/auth-context': { useAuth: () => auth }, '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
    '@/lib/api': { isAbortError: (e: Error) => e.name === 'AbortError' },
    '@/lib/error-utils': { formatUserFacingError: () => 'fetch-error' },
    '@/lib/review-growth': { buildHistoryGrowthSnapshot: () => ({ practiceTheme: { dimension: 'composition', intensity: 1, reviewCount: 1 } }) },
    '@/components/marketing/ProPromoCard': { default: 'ProPromoCard' }, '@/lib/pro-conversion': { getProUpgradeTriggerCopy: () => ({}) },
    '@/lib/date-filters': { displayDateToIso: () => '', isInvalidCompletedDate: () => false },
    '@/lib/review-history-copy': { getHistoryCopy: () => ({ apply: 'Apply', reset: 'Reset' }), getHistoryGrowthCopy: () => ({}), getHistoryPracticeThemeCopy: () => ({}), getImageTypeLabel: () => '' },
    '@/features/reviews/components/ReviewHistoryPanels': { DateFilterField: 'DateFilterField', ReviewCard: 'ReviewCard', ReviewGrowthPanel: 'ReviewGrowthPanel', ReviewHistorySkeletonList: 'ReviewHistorySkeletonList' },
    '@/features/reviews/components/GalleryConfirmDialog': { GalleryConfirmDialog: 'GalleryConfirmDialog' },
    '@/features/reviews/components/RetakeProgressPanel': { RetakeProgressPanel: 'RetakeProgressPanel' },
    '@/lib/review-page-copy': { getGalleryActionCopy: () => ({ doneApproved: 'approved' }) }, '@/lib/retake-coach-copy': { getRetakeCoachCopy: () => ({}) },
    '@/features/practice/journal': { isFreshPracticeRequest: (id: number, current: number, signal?: AbortSignal) => id === current && !signal?.aborted },
    '@/features/practice/components/PracticeJournalPanels': {},
    '@/features/reviews/components/ReviewOrganizationPanel': { ReviewOrganizationPanel: 'ReviewOrganizationPanel' },
    '@/features/reviews/components/ReviewVisibilityPanel': { ReviewVisibilityPanel: 'ReviewVisibilityPanel' },
    '@/features/reviews/api/reviewOrganizationApi': { getReviewVisibility: async (id: string) => ({ review_id: id, gallery_visible: false }), ...api },
  });
  return { ...app, changeOwner(id: string) { auth = authFor(id); app.render(); }, delayToken(promise: Promise<string>) { auth = { ...auth, ensureToken: () => promise }; app.render(); } };
}
const t = (key: string) => key;
const button = (app: ReturnType<typeof history>, text: string) => app.nodes(n => n.type === 'button' && JSON.stringify(n.props.children).includes(text))[0];
const panel = (app: ReturnType<typeof history>, type: string) => app.nodes(n => n.type === type)[0];
function applyTag(app: ReturnType<typeof history>, value: string) { app.nodes(n => n.type === 'input' && n.props.type === 'search')[1].props.onChange({ target: { value } }); app.render(); button(app, 'Apply').props.onClick(); app.render(); }

for (const phase of ['initial', 'pagination'] as const) {
  test(`history: ${phase} response cannot reveal old-owner records after an identity switch`, async () => {
    const late = deferred<any>(); let signal: AbortSignal | undefined;
    const app = history({ getOrganizedMyReviews: async (token: string, query: { cursor?: string }, requestSignal?: AbortSignal) => {
      if (token === 'other-token') return { items: [item('other-private')], next_cursor: null };
      if (phase === 'initial' || query.cursor) { signal = requestSignal; return late.promise; }
      return { items: [item('owner-private')], next_cursor: 'next' };
    } });
    app.render(); await settle(); app.render();
    if (phase === 'pagination') { button(app, 'reviews_load_more').props.onClick(); await settle(); }
    app.changeOwner('other'); assert.doesNotMatch(app.text(), /owner-private/); assert.equal(signal?.aborted, true);
    await settle(); app.render(); late.resolve({ items: [item('late-owner-private')], next_cursor: null }); await settle(); app.render();
    assert.match(app.text(), /other-private/); assert.doesNotMatch(app.text(), /late-owner-private/); app.unmount();
  });
}
for (const failure of [false, true]) {
  test(`history: obsolete page-two ${failure ? 'failure' : 'success'} cannot affect newer filters; busy lock resets`, async () => {
    const late = deferred<any>(); let calls = 0; let signal: AbortSignal | undefined;
    const app = history({ getOrganizedMyReviews: async (_token: string, query: { cursor?: string; tag?: string[] }, requestSignal?: AbortSignal) => {
      if (query.cursor && ++calls === 1) { signal = requestSignal; return late.promise; }
      if (query.cursor) return { items: [item('filtered-page')], next_cursor: null };
      return { items: [item(query.tag ? 'filtered-first' : 'unfiltered-first')], next_cursor: 'next' };
    } });
    app.render(); await settle(); app.render(); const load = button(app, 'reviews_load_more'); load.props.onClick(); load.props.onClick(); await settle(); assert.equal(calls, 1);
    applyTag(app, 'even'); await settle(); app.render(); assert.equal(signal?.aborted, true); assert.equal(button(app, 'reviews_load_more').props.disabled, false);
    button(app, 'reviews_load_more').props.onClick(); await settle(); app.render();
    if (failure) late.reject(Error('stale failure')); else late.resolve({ items: [item('unfiltered-late')], next_cursor: null });
    await settle(); app.render(); assert.match(app.text(), /filtered-first/); assert.match(app.text(), /filtered-page/); assert.doesNotMatch(app.text(), /unfiltered-late|fetch-error/); app.unmount();
  });
}
for (const action of ['metadata', 'gallery'] as const) {
  test(`history: ${action} completion from a previous identity cannot refresh or publish state in the new session`, async () => {
    const late = deferred<any>(); let visibilityCalls = 0;
    const app = history({ getOrganizedMyReviews: async (token: string) => ({ items: [item(token)], next_cursor: null }), getReviewVisibility: async () => { visibilityCalls++; return {}; }, updateOrganizedReviewMeta: () => late.promise });
    app.render(); await settle(); app.render(); await settle(); app.render();
    if (action === 'metadata') panel(app, 'ReviewOrganizationPanel').props.onSave({ tags: ['secret'], note: 'private' });
    else { panel(app, 'ReviewVisibilityPanel').props.onAddGallery(); app.render(); panel(app, 'GalleryConfirmDialog').props.onConfirm(); }
    await settle(); app.changeOwner('other'); await settle(); app.render(); await settle(); app.render(); const calls = visibilityCalls;
    late.resolve({ note: 'old-secret', tags: ['old-secret'], gallery_visible: true, gallery_audit_status: 'approved' }); await settle(); app.render();
    assert.equal(visibilityCalls, calls); assert.doesNotMatch(app.text(), /old-secret|owner-token/); assert.match(app.text(), /other-token/); app.unmount();
  });
}
