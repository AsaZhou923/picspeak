import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { componentHarness, deferred, settle } from './helpers/component-harness.ts';
import { createAuthOwnerState } from './helpers/auth-owner-state.ts';
import * as generationRequest from '../src/features/generations/generation-request.ts';

function loadReviewActionSupport() {
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(
    fs.readFileSync(new URL('../src/features/reviews/hooks/reviewActionSupport.ts', import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === '@/lib/locale') return { localeToIntlLocale: () => 'en-US' };
      if (name === '@/lib/review-page-copy') return { getImageTypeLabelForLocale: () => 'Default' };
      return {};
    },
  });
  return exports as { resolvePostDeleteReviewHref: (backHref: string, plan?: string | null) => string };
}

const { resolvePostDeleteReviewHref } = loadReviewActionSupport();
const t = (key: string) => key;

test('resolvePostDeleteReviewHref returns the appropriate parent list by origin and plan', () => {
  assert.equal(resolvePostDeleteReviewHref('/account/favorites', 'free'), '/account/favorites');
  assert.equal(resolvePostDeleteReviewHref('/account/reviews', 'free'), '/account/reviews');
  assert.equal(resolvePostDeleteReviewHref('/workspace', 'guest'), '/workspace');
  assert.equal(resolvePostDeleteReviewHref('/workspace', 'free'), '/account/reviews');
  assert.equal(resolvePostDeleteReviewHref('/gallery', 'pro'), '/account/reviews');
});

test('DeleteConfirmDialog exposes accessible dialog semantics and blocks dismissal while busy', () => {
  let closed = 0;
  let confirmed = 0;
  const app = componentHarness(new URL('../src/components/ui/DeleteConfirmDialog.tsx', import.meta.url), {
    'lucide-react': {},
    '@/lib/hooks/useModalFocusTrap': {
      useModalFocusTrap: () => ({ current: null }),
    },
  });

  const baseProps = {
    label: 'Delete critique',
    title: 'Delete this critique?',
    body: 'Irreversible action.',
    consequences: ['Cannot be restored.', 'Removed after 24 hours.', 'Public links go offline.'],
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm delete',
    busyLabel: 'Deleting…',
    busy: false,
    error: '',
    onClose: () => { closed++; },
    onConfirm: () => { confirmed++; },
  };

  app.render(baseProps, 'DeleteConfirmDialog');
  const dialog = app.nodes((node) => node.props?.role === 'dialog')[0];
  assert.ok(dialog);
  assert.equal(dialog.props['aria-modal'], 'true');
  assert.ok(dialog.props['aria-labelledby']);
  assert.ok(dialog.props['aria-describedby']);
  assert.match(app.text(), /Cannot be restored/);
  assert.match(app.text(), /24 hours/);
  assert.match(app.text(), /Public links go offline/);

  const confirmBtn = app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes('Confirm delete'))[0];
  const cancelBtn = app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes('Cancel'))[0];
  assert.ok(confirmBtn && cancelBtn);
  confirmBtn.props.onClick();
  cancelBtn.props.onClick();
  assert.equal(confirmed, 1);
  assert.equal(closed, 1);

  app.render({ ...baseProps, busy: true, error: 'Failed to delete' }, 'DeleteConfirmDialog');
  const busyConfirm = app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes('Deleting…'))[0];
  assert.equal(busyConfirm.props.disabled, true);
  assert.equal(busyConfirm.props['aria-busy'], true);
  const backdrop = app.nodes((node) => node.type === 'div' && typeof node.props.onClick === 'function')[0];
  backdrop.props.onClick();
  assert.equal(closed, 1, 'backdrop click must not close while deletion is in flight');
  assert.match(app.text(), /Failed to delete/);
  app.unmount();
});

test('DeleteConfirmDialog fits short viewports by scrolling only the explanation', () => {
  const app = componentHarness(new URL('../src/components/ui/DeleteConfirmDialog.tsx', import.meta.url), {
    'lucide-react': {},
    '@/lib/hooks/useModalFocusTrap': {
      useModalFocusTrap: () => ({ current: null }),
    },
  });

  app.render({
    label: 'Delete critique',
    title: 'Delete this critique?',
    body: 'Irreversible action.',
    consequences: ['Cannot be restored.', 'Removed after 24 hours.'],
    cancelLabel: 'Cancel',
    confirmLabel: 'Confirm delete',
    busyLabel: 'Deleting…',
    busy: false,
    error: 'Failed to delete',
    onClose: () => {},
    onConfirm: () => {},
  }, 'DeleteConfirmDialog');

  const classes = (node: { props?: { className?: unknown } }) => String(node.props?.className ?? '').split(/\s+/);
  const dialog = app.nodes((node) => node.props?.role === 'dialog')[0];
  assert.ok(classes(dialog).includes('max-h-[calc(100dvh-2rem)]'), 'dialog must be capped to the dynamic viewport height');
  assert.ok(classes(dialog).includes('flex') && classes(dialog).includes('flex-col'));

  const scrollRegions = app.nodes((node) => node.type === 'div' && classes(node).includes('overflow-y-auto'));
  assert.equal(scrollRegions.length, 1);
  const scrollRegion = JSON.stringify(scrollRegions[0]);
  assert.ok(classes(scrollRegions[0]).includes('min-h-0') && classes(scrollRegions[0]).includes('flex-1'));
  assert.match(scrollRegion, /Irreversible action/);
  assert.match(scrollRegion, /Cannot be restored/);
  assert.doesNotMatch(scrollRegion, /Delete this critique\?/, 'title stays outside the scroll region');
  assert.doesNotMatch(scrollRegion, /Confirm delete|Failed to delete/, 'actions and errors stay outside the scroll region');

  const actions = app.nodes((node) => node.type === 'div'
    && classes(node).includes('shrink-0')
    && JSON.stringify(node.props.children).includes('Confirm delete'));
  assert.equal(actions.length, 1, 'action row must not shrink out of view');
  const alert = app.nodes((node) => node.props?.role === 'alert')[0];
  assert.ok(classes(alert).includes('shrink-0'));
  app.unmount();
});

test('ReviewActionBar renders Delete critique only for owner views and never on public/non-owner surfaces', async () => {
  const app = componentHarness(new URL('../src/features/reviews/components/ReviewActionBar.tsx', import.meta.url), {
    'next/link': { default: 'Link' },
    'lucide-react': {},
    '@clerk/nextjs': { SignInButton: 'SignInButton' },
    '@/features/reviews/reviewVisibility': {
      getGalleryState: () => 'not_added',
      getGalleryStateCopy: () => ({ signIn: 'Sign in', add: 'Add', remove: 'Remove', withdraw: 'Withdraw', adding: 'Adding', removing: 'Removing', labels: { not_added: 'Private' } }),
    },
  });

  const baseProps = {
    review: { review_id: 'rev_1', favorite: false, gallery_visible: false, viewer_is_owner: true },
    showOwnerActions: true,
    showGuestHistoryLink: false,
    locale: 'en',
    actionBusy: null,
    favoriteCopy: { add: 'Favorite', remove: 'Unfavorite' },
    exportLabel: 'Export',
    shareLabel: 'Share',
    onGalleryToggle() {},
    onFavoriteToggle() {},
    onShareLink() {},
    onExportSummary() {},
    onDeleteReview() {},
    t,
  };

  app.render(baseProps, 'ReviewActionBar');
  assert.match(app.text(), /delete_review_action/);

  app.render({ ...baseProps, showOwnerActions: false }, 'ReviewActionBar');
  assert.doesNotMatch(app.text(), /delete_review_action/);
  app.unmount();

  const [galleryView, sharePage] = await Promise.all([
    readFile(new URL('../src/components/gallery/PublicGalleryReviewView.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/app/share/[shareToken]/page.tsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(galleryView, /deleteReview|delete_review_action|DeleteConfirmDialog/);
  assert.doesNotMatch(sharePage, /deleteReview|delete_review_action|DeleteConfirmDialog/);
});

test('useReviewActions deletes owned critique, evicts photo caches, invokes onDeleted, and maps errors', async () => {
  const authState = createAuthOwnerState('owner');
  let auth = authState.read();
  const deletedCalls: Array<{ id: string; token: string }> = [];
  const evictedThumbs: string[] = [];
  const evictedPreviews: string[] = [];
  let onDeletedCount = 0;
  let shouldFail = false;

  const app = componentHarness(new URL('../src/features/reviews/hooks/useReviewActions.ts', import.meta.url), {
    '@/lib/api': {
      createReviewShare: async () => ({}),
      exportReview: async () => ({}),
      updateReviewMeta: async () => ({}),
      deleteReview: async (id: string, token: string) => {
        if (shouldFail) throw { name: 'ApiException', code: 'REVIEW_NOT_FOUND' };
        deletedCalls.push({ id, token });
      },
    },
    '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
    '@/lib/error-utils': { formatUserFacingError: (_t: unknown, err: any, fallback: string) => err?.code ? `mapped:${err.code}` : fallback },
    '@/lib/photo-preview-cache': { evictPhotoPreviewCache: async (photoId: string) => { evictedPreviews.push(photoId); } },
    '@/lib/review-thumbnail-cache': { evictReviewThumbnailCache: async (photoId: string) => { evictedThumbs.push(photoId); } },
    '@/lib/product-analytics': { trackProductEvent() {} },
    '@/lib/review-page-copy': {
      getExportSummaryCopy: () => ({}),
      getFavoriteActionCopy: () => ({}),
      getGalleryActionCopy: () => ({}),
      getReviewActionCopy: () => ({}),
    },
    './reviewActionSupport': { buildReviewExportMarkdown: () => '', mergeReviewMeta: (r: any) => r },
  });

  const review = { review_id: 'rev_owner', photo_id: 'pho_1', viewer_is_owner: true };
  let state: any = app.render({ review, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  state.handleDeleteOpen();
  state = app.render({ review, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  assert.equal(state.deleteConfirmOpen, true);

  shouldFail = true;
  await state.handleDeleteConfirm();
  state = app.render({ review, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  assert.equal(state.deleteError, 'mapped:REVIEW_NOT_FOUND');
  assert.equal(state.deleteConfirmOpen, true);
  assert.equal(onDeletedCount, 0);

  shouldFail = false;
  await state.handleDeleteConfirm();
  state = app.render({ review, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  assert.deepEqual(deletedCalls, [{ id: 'rev_owner', token: 'owner-token' }]);
  assert.deepEqual(evictedThumbs, ['pho_1']);
  assert.deepEqual(evictedPreviews, ['pho_1']);
  assert.equal(onDeletedCount, 1);
  assert.equal(state.deleteConfirmOpen, false);

  // Non-owner cannot open delete confirmation
  const foreignReview = { review_id: 'rev_other', photo_id: 'pho_2', viewer_is_owner: false };
  state = app.render({ review: foreignReview, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  state.handleDeleteOpen();
  state = app.render({ review: foreignReview, setReview() {}, onDeleted: () => { onDeletedCount++; } }, 'useReviewActions');
  assert.equal(state.deleteConfirmOpen, false);
  app.unmount();
});

test('account review history deletes a critique after confirmation and removes it from the list', async () => {
  const deleted: string[] = [];
  const auth = { userInfo: { user_id: 'owner', plan: 'free', access_token: 'owner-token' }, isLoading: false, ensureToken: async () => 'owner-token' };
  const reviewItem = (id: string) => ({
    review_id: id, photo_id: `photo-${id}`, created_at: '2026-10-20T00:00:00Z',
    image_type: 'landscape', final_score: 7.5, status: 'SUCCEEDED', mode: 'flash', tags: [], note: '',
  });
  const app = componentHarness(new URL('../src/app/account/reviews/page.tsx', import.meta.url), {
    'next/link': { default: 'Link' }, 'lucide-react': {},
    'next/navigation': { useRouter: () => ({ replace() {} }), usePathname: () => '/account/reviews', useSearchParams: () => new URLSearchParams() },
    '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
    '@/lib/api': {
      isAbortError: (e: Error) => e.name === 'AbortError',
      deleteReview: async (id: string) => { deleted.push(id); },
    },
    '@/lib/photo-preview-cache': { evictPhotoPreviewCache: async () => undefined },
    '@/lib/review-thumbnail-cache': { evictReviewThumbnailCache: async () => undefined },
    '@/components/ui/DeleteConfirmDialog': { DeleteConfirmDialog: 'DeleteConfirmDialog' },
    '@/lib/error-utils': { formatUserFacingError: () => 'mapped-delete-error' },
    '@/lib/review-growth': { buildHistoryGrowthSnapshot: () => ({ practiceTheme: { dimension: 'composition', intensity: 1, reviewCount: 1 } }) },
    '@/components/marketing/ProPromoCard': { default: 'ProPromoCard' },
    '@/lib/pro-conversion': { getProUpgradeTriggerCopy: () => ({}) },
    '@/lib/date-filters': { displayDateToIso: () => '', isInvalidCompletedDate: () => false },
    '@/lib/review-history-copy': { getHistoryCopy: () => ({ apply: 'Apply', reset: 'Reset' }), getHistoryGrowthCopy: () => ({}), getHistoryPracticeThemeCopy: () => ({}), getImageTypeLabel: () => '' },
    '@/features/reviews/components/ReviewHistoryPanels': { DateFilterField: 'DateFilterField', ReviewCard: 'ReviewCard', ReviewGrowthPanel: 'ReviewGrowthPanel', ReviewHistorySkeletonList: 'ReviewHistorySkeletonList' },
    '@/features/reviews/components/GalleryConfirmDialog': { GalleryConfirmDialog: 'GalleryConfirmDialog' },
    '@/features/reviews/components/RetakeProgressPanel': { RetakeProgressPanel: 'RetakeProgressPanel' },
    '@/lib/review-page-copy': { getGalleryActionCopy: () => ({}) },
    '@/lib/retake-coach-copy': { getRetakeCoachCopy: () => ({}) },
    '@/features/practice/journal': { isFreshPracticeRequest: () => true },
    '@/features/practice/components/PracticeJournalPanels': {},
    '@/features/reviews/components/ReviewOrganizationPanel': { ReviewOrganizationPanel: 'ReviewOrganizationPanel' },
    '@/features/reviews/components/ReviewVisibilityPanel': { ReviewVisibilityPanel: 'ReviewVisibilityPanel' },
    '@/features/reviews/api/reviewOrganizationApi': {
      getOrganizedMyReviews: async () => ({ items: [reviewItem('rev-1'), reviewItem('rev-2')], next_cursor: null }),
      getReviewVisibility: async (id: string) => ({ review_id: id, gallery_visible: false }),
    },
  });

  app.render(); await settle(); app.render();
  const cards = app.nodes((node) => node.type === 'ReviewCard');
  assert.equal(cards.length, 2);
  cards[0].props.onDelete(reviewItem('rev-1'));
  app.render();

  const dialog = app.nodes((node) => node.type === 'DeleteConfirmDialog')[0];
  assert.ok(dialog);
  dialog.props.onConfirm();
  await settle(); app.render();

  assert.deepEqual(deleted, ['rev-1']);
  assert.equal(app.nodes((node) => node.type === 'ReviewCard').length, 1);
  assert.match(app.text(), /delete_review_done/);
  app.unmount();
});

test('generation detail deletes image after confirmation and navigates back to generation history', async () => {
  const authState = createAuthOwnerState('owner');
  let auth = authState.read();
  const deleted: string[] = [];
  const replaced: string[] = [];
  let refreshed = 0;
  let failDelete = false;

  const app = componentHarness(new URL('../src/app/generations/[generationId]/page.tsx', import.meta.url), {
    'next/image': { default: 'Image' },
    'next/link': { default: 'Link' },
    'next/navigation': {
      useParams: () => ({ generationId: 'gen_1' }),
      useRouter: () => ({
        push: (path: string) => { replaced.push(path); },
        replace: (path: string) => { replaced.push(path); },
        refresh: () => { refreshed++; },
        back() {},
      }),
    },
    'lucide-react': {},
    '@/components/ui/DeleteConfirmDialog': { DeleteConfirmDialog: 'DeleteConfirmDialog' },
    '@/features/generations/generation-request': generationRequest,
    '@/features/generations/generation-config': { formatGenerationOutputSpec: () => '1024x1024', formatGenerationModelName: (name: string) => name },
    '@/features/generations/generation-page-copy': { QUALITY_COPY_KEYS: { low: { label: 'low' } } },
    '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
    '@/lib/error-utils': { formatUserFacingError: (_t: unknown, err: any) => `err:${err?.code ?? 'unknown'}` },
    '@/lib/product-analytics': { readProductAttributionSource() {}, trackProductEvent() {} },
    '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/api': {
      getGeneration: async () => ({
        generation_id: 'gen_1', prompt: 'sunset portrait', image_url: 'https://example.test/gen_1.webp',
        quality: 'low', size: '1024x1024', output_format: 'webp', credits_charged: 1,
        model_name: 'gpt-image-2', generation_mode: 'general', intent: 'photo_inspiration',
        created_at: '2026-10-20T00:00:00Z', metadata: {},
      }),
      deleteGeneration: async (id: string) => {
        if (failDelete) throw { code: 'GENERATION_NOT_FOUND' };
        deleted.push(id);
      },
    },
  });

  app.render(); await settle(); app.render();
  const deleteTrigger = app.nodes((node) => node.type === 'button' && JSON.stringify(node.props.children).includes('delete_generation_action'))[0];
  assert.ok(deleteTrigger);
  deleteTrigger.props.onClick();
  app.render();

  failDelete = true;
  let dialog = app.nodes((node) => node.type === 'DeleteConfirmDialog')[0];
  assert.ok(dialog);
  dialog.props.onConfirm();
  await settle(); app.render();
  dialog = app.nodes((node) => node.type === 'DeleteConfirmDialog')[0];
  assert.equal(dialog.props.error, 'err:GENERATION_NOT_FOUND');
  assert.deepEqual(replaced, []);

  failDelete = false;
  dialog.props.onConfirm();
  await settle(); app.render();
  assert.deepEqual(deleted, ['gen_1']);
  assert.deepEqual(replaced, ['/account/generations']);
  assert.equal(refreshed, 1);
  app.unmount();
});

test('generation history deletes an item after confirmation and ignores stale completion after owner switch', async () => {
  const authState = createAuthOwnerState('owner');
  let auth = authState.read();
  const pendingDelete = deferred<void>();
  const deleted: string[] = [];
  const genItem = (id: string) => ({
    generation_id: id, prompt: `prompt-${id}`, image_url: `https://example.test/${id}.webp`,
    quality: 'low', size: '1024x1024', credits_charged: 1, created_at: '2026-10-20T00:00:00Z',
  });

  const app = componentHarness(new URL('../src/app/account/generations/page.tsx', import.meta.url), {
    'next/image': { default: 'Image' },
    'next/link': { default: 'Link' },
    'lucide-react': {},
    '@/components/ui/DeleteConfirmDialog': { DeleteConfirmDialog: 'DeleteConfirmDialog' },
    '@/features/generations/generation-config': { formatGenerationOutputSpec: () => '1024x1024' },
    '@/lib/i18n': { useI18n: () => ({ t, locale: 'en' }) },
    '@/lib/locale': { localeToIntlLocale: () => 'en-US' },
    '@/lib/error-utils': { formatUserFacingError: () => 'delete-error' },
    '@/lib/auth-context': { useAuth: () => auth },
    '@/lib/api': {
      getMyGenerations: async (token: string) => ({
        items: token === 'owner-token' ? [genItem('g1'), genItem('g2')] : [genItem('other-g1')],
        next_cursor: null,
      }),
      deleteGeneration: async (id: string) => {
        deleted.push(id);
        if (id === 'g2') return pendingDelete.promise;
      },
    },
  });

  app.render(); await settle(); app.render();
  const deleteButtons = app.nodes((node) => node.type === 'button' && node.props['aria-label'] === 'delete_generation_action');
  assert.equal(deleteButtons.length, 2);

  deleteButtons[0].props.onClick();
  app.render();
  app.nodes((node) => node.type === 'DeleteConfirmDialog')[0].props.onConfirm();
  await settle(); app.render();
  assert.deepEqual(deleted, ['g1']);
  assert.doesNotMatch(app.text(), /prompt-g1/);
  assert.match(app.text(), /prompt-g2/);
  assert.match(app.text(), /delete_generation_done/);

  // Start deleting g2, then switch owner before it resolves
  app.nodes((node) => node.type === 'button' && node.props['aria-label'] === 'delete_generation_action')[0].props.onClick();
  app.render();
  app.nodes((node) => node.type === 'DeleteConfirmDialog')[0].props.onConfirm();
  await settle();
  authState.changeOwner('other');
  auth = authState.read();
  app.render(); await settle(); app.render();
  pendingDelete.resolve();
  await settle(); app.render();
  assert.match(app.text(), /prompt-other-g1/);
  assert.doesNotMatch(app.text(), /delete_generation_done/);
  app.unmount();
});
