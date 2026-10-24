import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness } from './helpers/component-harness.ts';
import * as visibilityHelpers from '../src/features/reviews/reviewVisibility.ts';
import * as journal from '../src/features/practice/journal.ts';

for (const locale of ['en', 'zh', 'ja']) test(`sharing controls explain public preservation and withdrawal limits in ${locale}`, () => {
  const app = componentHarness(new URL('../src/features/reviews/components/ReviewVisibilityPanel.tsx', import.meta.url), {
    'lucide-react': {},
    '@clerk/nextjs': { SignInButton: 'SignInButton' },
    '@/features/reviews/reviewVisibility': visibilityHelpers,
  });
  const props = {
    item: { review_id: 'review' }, locale, busy: false,
    visibility: { share_enabled: true, share_url: '/share/token', gallery_visible: true, gallery_audit_status: 'approved' },
    onRefresh() {}, onCreateShare: async () => {}, onRevokeShare: async () => {}, onRemoveGallery: async () => {}, onStopAll: async () => {}, onAddGallery() {},
  };
  app.render(props, 'ReviewVisibilityPanel');
  assert.match(app.text(), /15/);
  assert.match(app.text(), /permanently|永久/);
  assert.match(app.text(), /original limit|恢复原有期限|元の期限/);
  assert.match(app.text(), /delete your work|主动删除|削除する/);
  app.render({ ...props, visibility: { ...props.visibility, share_enabled: false, gallery_audit_status: 'pending' } }, 'ReviewVisibilityPanel');
  assert.match(app.text(), /after approval|审核通过|審査に通る/);
  app.unmount();
});

test('practice summary separates not-applicable submissions from ordinary failures', () => {
  const app = componentHarness(new URL('../src/features/practice/components/PracticeJournalPanels.tsx', import.meta.url), {
    'next/link': { default: 'Link' }, 'lucide-react': {},
    '@/features/practice/journal': journal,
    '@/lib/review-history-copy': { getHistoryIntlLocale: () => 'en-US' },
  });
  app.render({
    summary: { timeframe: { start_at: null, end_at: null }, status_counts: {}, session_count: 1, attempt_count: 3, completed_sample_count: 0, indeterminate_count: 0, unknown_count: 0, failed_count: 1, not_applicable_count: 2 },
    copy: {}, labels: { assessment: { failed: 'service-failures' }, attemptState: { not_applicable: 'not-applicable-inputs' } }, locale: 'en', loading: false, error: '', onRetry() {},
  }, 'PracticeSummaryPanel');
  const badges = app.nodes((node) => node.type === 'span');
  const rejected = badges.find((node) => JSON.stringify(node.props.children).includes('not-applicable-inputs'));
  assert.ok(rejected);
  assert.match(JSON.stringify(rejected.props.children), /2/);
  assert.doesNotMatch(rejected.props.className, /text-rust/);
  assert.match(app.text(), /service-failures/);
  app.unmount();
});
