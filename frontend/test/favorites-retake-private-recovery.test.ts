import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';

const t = (key: string) => key;
const item = (id: string) => ({
  review_id: id, photo_id: `photo-${id}`, photo_url: `https://example.test/${id}.jpg`,
  created_at: '2026-10-20T00:00:00Z', image_type: 'landscape', final_score: 7.4,
  status: 'SUCCEEDED', mode: 'flash', favorite: true,
  scores: { composition: 7, lighting: 7, color: 8, impact: 7, technical: 8 },
});
const authFor = (id: string) => ({
  userInfo: { user_id: id, plan: id === 'guest' ? 'guest' : 'free', access_token: `${id}-token` },
  isLoading: false, ensureToken: async () => `${id}-token`,
});
function appFor(kind: 'favorites' | 'retake', api: Record<string, any>) {
  let auth = authFor('owner');
  let locale = 'en';
  let translate = t;
  const copy = { steps: ['Original', 'Target', 'Retake', 'Compare'], dimensions: { composition: 'Composition' }, error: 'load-error', retry: 'Retry' };
  const app = componentHarness(new URL(kind === 'favorites' ? '../src/app/account/favorites/page.tsx' : '../src/app/retake/page.tsx', import.meta.url), {
    'next/link': { default: 'Link' }, 'next/image': { default: 'Image' }, 'lucide-react': {},
    '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/i18n': { useI18n: () => ({ t: translate, locale }) },
    '@/lib/api': { isAbortError: (error: Error) => error.name === 'AbortError', ...api },
    '@/lib/error-utils': { formatUserFacingError: () => 'localized-error' },
    '@/components/ui/Badge': { ModeBadge: 'ModeBadge', StatusBadge: 'StatusBadge' },
    '@/components/ui/CachedThumbnail': { default: 'CachedThumbnail' },
    '@/components/ui/LoadingSpinner': { SkeletonBlock: 'SkeletonBlock' },
    '@/lib/locale': { localeToIntlLocale: () => 'en-US' },
    '@/lib/review-history-copy': { getImageTypeLabel: () => 'Landscape' },
    '@/lib/retake-coach-copy': { getRetakeCoachCopy: () => copy },
    '@/lib/retake-coach': { getEligibleRetakeSources: (items: unknown[]) => items, buildRetakeWorkspaceHref: (entry: any) => `/workspace?source_review_id=${entry.review_id}` },
  });
  return { ...app,
    changeOwner(id: string) { auth = authFor(id); app.render(); },
    changeLocale(next: string) { locale = next; translate = (key: string) => `${next}:${key}`; app.render(); },
  };
}
const button = (app: ReturnType<typeof appFor>, name: string) => app.nodes(node => node.type === 'button' && JSON.stringify(node.props.children).includes(name))[0];

for (const kind of ['favorites', 'retake'] as const) {
  test(`${kind}: account switch synchronously removes private records and cancels late old-owner locale reads`, async () => {
    const late = deferred<any>();
    let oldCalls = 0;
    let oldSignal: AbortSignal | undefined;
    const app = appFor(kind, { getMyReviews: async (token: string, _query: unknown, signal?: AbortSignal) => {
      if (token === 'guest-token') return { items: [], next_cursor: null };
      if (++oldCalls > 1) { oldSignal = signal; return late.promise; }
      return { items: [item('private-owner')], next_cursor: null };
    } });
    app.render(); await settle(); app.render();
    assert.match(app.text(), /private-owner/);
    app.changeLocale('ja'); await settle();
    app.changeOwner('guest');
    assert.doesNotMatch(app.text(), /private-owner/);
    assert.equal(oldSignal?.aborted, true);
    await settle(); app.render();
    late.resolve({ items: [item('private-late-owner')], next_cursor: null });
    await settle(); app.render();
    assert.doesNotMatch(app.text(), /private-owner|private-late-owner/);
    app.unmount();
  });

  test(`${kind}: failure for a new account never reveals the prior account's records`, async () => {
    const app = appFor(kind, { getMyReviews: async (token: string) => {
      if (token !== 'owner-token') throw Error('503');
      return { items: [item('private-owner')], next_cursor: null };
    } });
    app.render(); await settle(); app.render(); assert.match(app.text(), /private-owner/);
    app.changeOwner('another'); await settle(); app.render();
    assert.doesNotMatch(app.text(), /private-owner/);
    assert.match(app.text(), /localized-error/);
    app.unmount();
  });

  test(`${kind}: superseded locale responses cannot replace a newer successful list`, async () => {
    const late = deferred<any>();
    let calls = 0;
    const app = appFor(kind, { getMyReviews: async () => {
      if (++calls === 2) return late.promise;
      return { items: [item(calls === 1 ? 'first' : 'newest')], next_cursor: null };
    } });
    app.render(); await settle(); app.render();
    app.changeLocale('ja'); await settle();
    app.changeLocale('zh'); await settle(); app.render();
    assert.match(app.text(), /newest/);
    late.resolve({ items: [item('obsolete')], next_cursor: null });
    await settle(); app.render();
    assert.match(app.text(), /newest/); assert.doesNotMatch(app.text(), /obsolete/);
    app.unmount();
  });
}

test('favorites: delayed pagination from an old account cannot append to the new account', async () => {
  const late = deferred<any>();
  let signal: AbortSignal | undefined;
  const app = appFor('favorites', { getMyReviews: async (token: string, query: { cursor?: string }, requestSignal?: AbortSignal) => {
    if (token === 'other-token') return { items: [item('other-private')], next_cursor: null };
    if (query.cursor) { signal = requestSignal; return late.promise; }
    return { items: [item('old-private')], next_cursor: 'page-two' };
  } });
  app.render(); await settle(); app.render();
  button(app, 'Load more').props.onClick(); await settle();
  app.changeOwner('other'); await settle(); app.render();
  assert.equal(signal?.aborted, true);
  late.resolve({ items: [item('old-late-private')], next_cursor: null });
  await settle(); app.render();
  assert.match(app.text(), /other-private/); assert.doesNotMatch(app.text(), /old-private|old-late-private/);
  app.unmount();
});

test('favorites: locale refresh resets pending pagination and same-tick clicks do not duplicate a page', async () => {
  const late = deferred<any>();
  let nextCalls = 0;
  const app = appFor('favorites', { getMyReviews: async (_token: string, query: { cursor?: string }) => {
    if (query.cursor) { if (++nextCalls === 1) return late.promise; return { items: [item('new-page')], next_cursor: null }; }
    return { items: [item('first')], next_cursor: 'next' };
  } });
  app.render(); await settle(); app.render();
  const more = button(app, 'Load more'); more.props.onClick(); more.props.onClick(); await settle();
  assert.equal(nextCalls, 1);
  app.changeLocale('ja'); await settle(); app.render();
  const retry = button(app, 'さらに読み込む'); assert.equal(retry.props.disabled, false);
  retry.props.onClick(); await settle(); app.render();
  late.resolve({ items: [item('obsolete-page')], next_cursor: null }); await settle(); app.render();
  assert.equal(nextCalls, 2); assert.match(app.text(), /new-page/); assert.doesNotMatch(app.text(), /obsolete-page/);
  app.unmount();
});

test('favorites: locale refresh resets a pending removal without a stale completion touching the new list', async () => {
  const late = deferred<any>();
  let mutations = 0;
  const app = appFor('favorites', {
    getMyReviews: async () => ({ items: [item('favorite')], next_cursor: null }),
    updateReviewMeta: async () => { if (++mutations === 1) return late.promise; return {}; },
  });
  app.render(); await settle(); app.render();
  button(app, 'Remove').props.onClick(); await settle();
  app.changeLocale('ja'); await settle(); app.render();
  const remove = button(app, '解除'); assert.equal(remove.props.disabled, false);
  late.resolve({}); await settle(); app.render(); assert.match(app.text(), /favorite/);
  remove.props.onClick(); await settle(); app.render();
  assert.equal(mutations, 2); assert.doesNotMatch(app.text(), /photo-favorite/);
  app.unmount();
});
