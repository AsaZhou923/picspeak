import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';

type Review = { review_id: string; photo_id: string; viewer_is_owner: boolean; photo_url: string };
const review = (id = 'review'): Review => ({ review_id: id, photo_id: `photo-${id}`, viewer_is_owner: true, photo_url: `https://example.test/${id}.webp` });
function harness(fetchReview: (id: string, token: string, signal: AbortSignal) => Promise<Review> = async (id) => review(id)) {
  let locale = 'en', owner = 'owner-a', token = 'token-a', reviewId = 'review';
  let t = (key: string) => `${locale}:${key}`, ensureToken = async () => token, authLoading = false;
  const calls: Array<{ id: string; token: string; signal: AbortSignal }> = [], analytics: any[] = [];
  const modules: Record<string, any> = {
    '@/lib/auth-context': { useAuth: () => ({ ensureToken, userInfo: owner ? { user_id: owner } : null, isLoading: authLoading, token }) },
    '@/lib/i18n': { useI18n: () => ({ locale, t }) },
    '@/lib/api': {
      getReview: (id: string, token: string, signal: AbortSignal) => { calls.push({ id, token, signal }); return fetchReview(id, token, signal); },
      isAbortError: (error: Error) => error.name === 'AbortError',
      getGenerationTemplates: async () => ({ credits_table: { medium: { '1024x1024': 2 } } }),
    },
    '@/lib/photo-preview-cache': { getUploadedPhotoPreviewSrc: async () => null },
    '@/lib/error-utils': { formatUserFacingError: (_t: unknown, _reason: unknown, fallback: string) => fallback },
    '@/lib/product-analytics': { trackProductEvent: (...args: any[]) => { analytics.push(args); } },
    'next/navigation': { useRouter: () => ({ push() {} }) }, 'lucide-react': {},
    '@/components/auth/ClerkSignInTrigger': { default: 'SignInButton' },
    '@/lib/hooks/useCreditPackCheckout': { useCreditPackCheckout: () => ({ busy: false }) },
    '@/lib/types': { ApiException: class extends Error {} }, '@/features/generations/generation-request': {},
    '@/features/generations/generation-config': { estimateGenerationCredits: () => 2, formatGenerationOutputSpec: () => 'output' },
  };
  const hook = componentHarness(new URL('../src/features/reviews/hooks/useReviewDetail.ts', import.meta.url), modules);
  const panel = componentHarness(new URL('../src/features/reviews/components/ReviewReferenceGenerationPanel.tsx', import.meta.url), modules);
  // Match ReviewPage's loading/error/absent-review boundary while executing the
  // actual hook and reference panel effects, state, and unmount cleanup.
  function render(): any {
    const state: any = hook.render(reviewId, 'useReviewDetail');
    if (state.loading || state.error || !state.review) panel.unmount();
    else panel.render({ reviewId: state.review.review_id, photoId: state.review.photo_id, suggestions: 'Keep the subject clear', imageType: 'default', plan: 'pro', locale }, 'ReviewReferenceGenerationPanel');
    return state;
  }
  const prompt = () => panel.nodes((node) => node.type === 'textarea')[0]?.props.value;
  return { render, prompt, calls, analytics,
    edit(value: string) { panel.nodes((node) => node.type === 'textarea')[0].props.onChange({ target: { value } }); render(); },
    changeLocale(value: string) { locale = value; t = (key) => `${locale}:${key}`; return render(); },
    changeAuth(nextOwner: string, loading = false) { owner = nextOwner; authLoading = loading; token = `token-${owner}`; ensureToken = async () => token; return render(); },
    refreshCallback() { token = 'refreshed-token'; ensureToken = async () => token; return render(); },
    changeReview(id: string) { reviewId = id; return render(); },
    unmount() { hook.unmount(); panel.unmount(); },
  };
}

test('review parent preserves edited and cleared reference drafts across locale and same-owner token callback changes', async () => {
  const app = harness(); app.render(); await settle(); app.render();
  assert.match(app.prompt(), /^en:/); app.edit('Keep this custom reference prompt');
  assert.equal(app.changeLocale('ja').loading, false);
  assert.equal(app.prompt(), 'Keep this custom reference prompt');
  await settle(); app.render(); assert.equal(app.prompt(), 'Keep this custom reference prompt');
  app.edit(''); app.changeLocale('zh'); assert.equal(app.prompt(), '');
  app.refreshCallback(); await settle(); app.render(); assert.equal(app.prompt(), '');
  assert.equal(app.calls.length, 1, 'presentation and callback changes must not reload the review');
  app.changeReview('different-review'); await settle(); app.render();
  assert.equal(app.calls.length, 2); assert.equal(app.calls[1].token, 'refreshed-token');
  assert.match(app.prompt(), /^zh:/, 'a real source change intentionally starts a new default draft'); app.unmount();
});

test('review parent aborts and clears private drafts on identity changes, including A to B to A late results', async () => {
  const late = deferred<Review>(); let requests = 0;
  const app = harness(async (id) => ++requests === 2 ? late.promise : review(id));
  app.render(); await settle(); app.render(); app.edit('owner A private draft');
  const oldRequest = app.calls[0]; assert.equal(app.changeAuth('owner-b').review, null);
  assert.equal(oldRequest.signal.aborted, true); await settle(); const abandoned = app.calls[1];
  app.changeAuth('owner-a'); assert.equal(abandoned.signal.aborted, true);
  await settle(); app.render(); assert.notEqual(app.prompt(), 'owner A private draft');
  late.resolve(review('stale-owner-b')); await settle();
  assert.equal(app.render().review.review_id, 'review'); assert.equal(app.calls.length, 3); app.unmount();
});

test('review auth-loading transition aborts pending fetch and suppresses stale success', async () => {
  const response = deferred<Review>(), app = harness(() => response.promise);
  app.render(); await settle(); assert.equal(app.calls.length, 1);
  assert.equal(app.changeAuth('owner-a', true).loading, true); assert.equal(app.calls[0].signal.aborted, true);
  response.resolve(review()); await settle(); assert.equal(app.render().review, null);
  assert.equal(app.calls.length, 1, 'auth loading must not create a new fetch'); app.unmount();
});

test('pending review fetch uses latest locale for analytics and errors without restarting', async () => {
  const response = deferred<Review>(), app = harness(() => response.promise);
  app.render(); await settle(); app.changeLocale('ja'); response.resolve(review()); await settle(); app.render();
  assert.equal(app.calls.length, 1); assert.equal(app.analytics[0][1].locale, 'ja'); app.unmount();
  const failed = deferred<Review>(), errors = harness(() => failed.promise);
  errors.render(); await settle(); errors.changeLocale('ja'); failed.reject(Error('offline')); await settle();
  assert.equal(errors.render().error, 'ja:review_err_fetch');
  assert.equal(errors.changeLocale('zh').error, 'zh:review_err_fetch'); assert.equal(errors.calls.length, 1);
  assert.equal(errors.changeAuth('owner-b').error, ''); errors.unmount();
});
