import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createAuthOwnerState } from './helpers/auth-owner-state.ts';
import { deferred } from './helpers/component-harness.ts';
import { buildPracticeStartRequest } from '../src/features/practice/start.ts';

// Execute the real components and their effect cleanup/dependency behavior without
// network, timers, or an additional DOM/test dependency.
type Node = { type: unknown; key?: string; props: Record<string, any> };
type Slot = { value?: any; deps?: unknown[]; cleanup?: () => void };
function harness(file: string, extra: Record<string, unknown> = {}, componentName?: string) {
  const slots: Slot[] = [];
  const timers = new Map<number, { at: number; run: () => void }>();
  const sockets: any[] = [];
  const calls: string[] = [];
  const pushes: string[] = [];
  let cursor = 0, now = 0, timerId = 0, dirty = false;
  let effects: (() => void)[] = [];
  let tree: Node;
  let locale = 'en';
  let taskId = 'task-a';
  let userId = 'user-a';
  const authOwner = createAuthOwnerState(userId);
  let translate = (key: string) => `${locale}:${key}`;
  const depsChanged = (before: unknown[] | undefined, after: unknown[]) => !before || before.length !== after.length || after.some((x, i) => !Object.is(x, before[i]));
  const react = {
    useState(initial: any) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, (value: any) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        dirty ||= !Object.is(slots[index].value, next);
        slots[index].value = next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const index = cursor++;
      if (depsChanged(slots[index]?.deps, deps)) slots[index] = { value: factory(), deps };
      return slots[index].value;
    },
    useCallback(callback: unknown, deps: unknown[]) { return react.useMemo(() => callback, deps); },
    useEffect(callback: () => void | (() => void), deps: unknown[]) {
      const index = cursor++;
      if (depsChanged(slots[index]?.deps, deps)) effects.push(() => {
        slots[index]?.cleanup?.();
        slots[index] = { deps, cleanup: callback() || undefined };
      });
    },
  };
  let tokenValue = 'test-token';
  let pendingToken: Promise<string> | null = null;
  let ensureToken = () => pendingToken ?? Promise.resolve(tokenValue);
  const router = { push: (url: string) => pushes.push(url), back() {} };
  const api: Record<string, any> = {
    buildTaskWebSocketUrl: (id: string) => `ws://test/${id}`,
    isAbortError: (error: Error) => error.name === 'AbortError',
    getTask: async (id: string) => { calls.push(`task:${id}`); return task(id, 'RUNNING'); },
    getMyReviews: async () => ({ items: [history('a'), history('b')], next_cursor: null }),
    getReview: async (id: string) => { calls.push(`review:${id}`); return review(id); },
    createPracticeSession: async (payload: any) => { calls.push(`save:${JSON.stringify(payload)}`); return { session_id: 'session-a' }; },
  };
  class ApiException extends Error { status: number; code: string; constructor(status: number, code: string) { super(code); this.status = status; this.code = code; } }
  const modules: Record<string, any> = {
    react,
    'react/jsx-runtime': { jsx: (type: unknown, props: unknown, key?: string) => ({ type, props, key }), jsxs: (type: unknown, props: unknown, key?: string) => ({ type, props, key }) },
    'next/link': { default: 'a' },
    'next/navigation': { useRouter: () => router, useParams: () => ({ taskId }), useSearchParams: () => new URLSearchParams() },
    'lucide-react': {},
    '@/lib/auth-context': { useAuth: () => ({ ensureToken, captureAuthOwner: authOwner.read().captureAuthOwner, token: 'test-token', userInfo: { user_id: userId, plan: 'pro' } }) },
    '@/lib/i18n': { useI18n: () => ({ locale, t: translate }) },
    '@/lib/api': api,
    '@/lib/types': { ApiException },
    '@/lib/error-utils': { formatUserFacingError: (_t: unknown, _err: unknown, fallback: string) => fallback, formatTaskError: () => '' },
    '@/lib/review-growth': { buildNextShootChecklist: (suggestions: any[]) => suggestions },
    '@/components/blog/WaitingBlogWindow': {},
    '@/lib/client-log': { logClientError() {} },
    '@/features/workspace/workspaceTaskFlow': { buildPracticeSemanticKey: JSON.stringify, readPendingPracticeState: () => null, writePendingPracticeState() {}, clearPendingPracticeState() {}, makePracticeIdempotencyKey: () => 'practice-key' },
    '../guidance': { guidanceDimensionLabel: (value: string) => value },
    '../start': { buildPracticeStartRequest },
    ...extra,
  };
  const exports: { default?: (props: any) => Node } = {};
  const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  vm.runInNewContext(compiled + (componentName ? `\nexports.default = ${componentName};` : ''), {
    exports, require: (name: string) => modules[name], AbortController, URLSearchParams,
    Date, setTimeout: (run: () => void, delay: number) => { timers.set(++timerId, { at: now + delay, run }); return timerId; },
    clearTimeout: (id: number) => timers.delete(id),
    WebSocket: class { constructor() { sockets.push(this); } close() {} },
  });
  let props: Record<string, any> = { templates: [template] };
  function render() {
    let renders = 0;
    do {
      dirty = false; cursor = 0; effects = [];
      tree = exports.default!(props);
      for (const effect of effects) effect();
      assert.ok(++renders < 25, 'component must settle');
    } while (dirty);
    return tree;
  }
  return {
    api, calls, sockets, pushes, render,
    setProps(next: Record<string, any>) { props = next; render(); },
    setLocale(next: string) { locale = next; translate = (key: string) => `${next}:${key}`; render(); },
    setTaskId(next: string) { taskId = next; render(); },
    setIdentity(next: string, rerender = true) { userId = next; authOwner.changeOwner(next); if (rerender) render(); },
    renewToken() { tokenValue = 'renewed-token'; },
    holdToken(value: Promise<string> | null) { pendingToken = value; },
    refreshTokenGetter() { ensureToken = async () => 'refreshed-token'; render(); },
    async flush() { for (let i = 0; i < 4; i++) { await new Promise((resolve) => setImmediate(resolve)); render(); } },
    advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.run(); } render(); },
    unmount() { for (const slot of slots) slot.cleanup?.(); },
    find(predicate: (node: Node) => boolean): Node {
      function walk(value: any): Node | undefined {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { for (const child of value) { const match = walk(child); if (match) return match; } return; }
        if (predicate(value)) return value;
        return walk(value.props?.children);
      }
      const node = walk(tree); assert.ok(node, 'expected rendered node'); return node;
    },
  };
}
const task = (id: string, status: string, result: string | null = null) => ({ task_id: id, status, progress: status === 'SUCCEEDED' ? 100 : 30, review_id: result });
const history = (id: string) => ({ review_id: id, status: 'SUCCEEDED', photo_url: `/${id}.jpg`, created_at: '2026-10-01', final_score: 7 });
const review = (id: string) => ({ review_id: id, result: { scores: {}, suggestions: [{ detail: `Suggested goal ${id}`, dimension: 'lighting' }] } });
const template = { template_id: 'edge', title: 'Separate edges', goal_example: 'Keep the red subject clear of the edge', dimension: 'composition', success_criteria: [{ key: 'edge', label: 'The subject is separated' }] };
const practiceFile = '../src/features/practice/components/PracticeStartPanel.tsx';
const taskFile = '../src/app/tasks/[taskId]/page.tsx';
const textarea = (app: ReturnType<typeof harness>) => app.find((node) => node.type === 'textarea');
const selector = (app: ReturnType<typeof harness>) => app.find((node) => node.props?.id === 'practice-original');
const templateSelect = (app: ReturnType<typeof harness>) => app.find((node) => node.type === 'select' && Array.isArray(node.props?.children) && node.props.children[0]?.props?.value === '');

for (const timing of ['before', 'after'] as const) test(`completed review still redirects when locale changes ${timing} success`, async () => {
  const app = harness(taskFile); app.render(); await app.flush();
  if (timing === 'before') app.setLocale('ja');
  app.sockets.at(-1).onmessage({ data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'review-a') }) });
  app.render(); app.advance(200);
  if (timing === 'after') app.setLocale('ja');
  app.setLocale('en'); app.advance(1000);
  assert.deepEqual(app.pushes, ['/reviews/review-a']);
  app.unmount();
});

test('practice preserves a manual draft across locale changes without refetching its source', async () => {
  const app = harness(practiceFile); app.render(); await app.flush();
  textarea(app).props.onChange({ target: { value: 'My carefully edited goal' } }); app.render();
  app.setLocale('ja'); await app.flush(); app.setLocale('en'); await app.flush();
  assert.equal(textarea(app).props.value, 'My carefully edited goal');
  assert.deepEqual(app.calls, ['review:a']);
  app.unmount();
});

test('practice preserves selected template, criteria, dimension and kind across locale changes', async () => {
  const app = harness(practiceFile); app.render(); await app.flush();
  templateSelect(app).props.onChange({ target: { value: 'edge' } }); app.render();
  app.find((node) => node.type === 'input' && node.props.value === 'edit_revision').props.onChange(); app.render();
  app.setLocale('ja'); await app.flush();
  assert.equal(templateSelect(app).props.value, 'edge');
  assert.equal(textarea(app).props.value, template.goal_example);
  const save = app.find((node) => node.type === 'button' && /保存して/.test(node.props.children));
  await Promise.all([save.props.onClick(), save.props.onClick()]); await app.flush();
  const payloads = app.calls.filter((call) => call.startsWith('save:')).map((call) => JSON.parse(call.slice(5)));
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].practice_kind, 'edit_revision');
  assert.equal(payloads[0].goal_snapshot.dimension, 'composition');
  assert.deepEqual(payloads[0].success_criteria, template.success_criteria);
  assert.deepEqual(app.pushes, ['/workspace?practice_session_id=session-a']);
  app.unmount();
});

test('changing practice originals rejects a late old response and initializes only the new source', async () => {
  const app = harness(practiceFile);
  let resolveOld!: (value: unknown) => void;
  let oldSignal!: AbortSignal;
  app.api.getReview = (id: string, _token: string, signal: AbortSignal) => id === 'a'
    ? new Promise((resolve) => { resolveOld = resolve; oldSignal = signal; })
    : Promise.resolve(review(id));
  app.render(); await app.flush();
  selector(app).props.onChange({ target: { value: 'b' } }); app.render(); await app.flush();
  assert.equal(oldSignal.aborted, true);
  assert.equal(textarea(app).props.value, 'Suggested goal b');
  textarea(app).props.onChange({ target: { value: 'An edited goal for b' } }); app.render();
  resolveOld(review('a')); await app.flush();
  assert.equal(textarea(app).props.value, 'An edited goal for b');
  assert.equal(selector(app).props.value, 'b');
  app.unmount();
});

test('explicitly choosing a different original resets the template but locale does not', async () => {
  const app = harness(practiceFile); app.render(); await app.flush();
  templateSelect(app).props.onChange({ target: { value: 'edge' } }); app.render();
  selector(app).props.onChange({ target: { value: 'b' } }); app.render(); await app.flush();
  assert.equal(textarea(app).props.value, 'Suggested goal b');
  assert.equal(templateSelect(app).props.value, '');
  app.setLocale('zh'); await app.flush();
  assert.equal(textarea(app).props.value, 'Suggested goal b');
  selector(app).props.onChange({ target: { value: 'a' } }); app.render(); await app.flush();
  assert.equal(textarea(app).props.value, 'Suggested goal a');
  app.unmount();
});

test('a task identity change cancels old navigation, ignores stale sockets and resets the terminal guard', async () => {
  const app = harness(taskFile); app.render(); await app.flush();
  const oldSocket = app.sockets[0];
  oldSocket.onmessage({ data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'review-a') }) });
  app.render(); app.advance(200);
  app.setTaskId('task-b'); await app.flush();
  oldSocket.onmessage({ data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'stale-review') }) });
  app.sockets.at(-1).onmessage({ data: JSON.stringify({ task: task('task-b', 'SUCCEEDED', 'review-b') }) });
  app.render(); app.advance(1000);
  assert.deepEqual(app.pushes, ['/reviews/review-b']);
  app.unmount();
});

test('an aborted task response cannot replace the new task or restart its poll chain', async () => {
  const app = harness(taskFile);
  let resolveOld!: (value: unknown) => void;
  let oldSignal!: AbortSignal;
  app.api.getTask = (id: string, _token: string, signal: AbortSignal) => {
    app.calls.push(id);
    return id === 'task-a'
      ? new Promise((resolve) => { resolveOld = resolve; oldSignal = signal; })
      : Promise.resolve(task(id, 'RUNNING'));
  };
  app.render(); await app.flush();
  app.setTaskId('task-b'); await app.flush();
  assert.equal(oldSignal.aborted, true);
  resolveOld(task('task-a', 'SUCCEEDED', 'stale-review')); await app.flush();
  app.advance(2000); await app.flush();
  assert.deepEqual(app.pushes, []);
  assert.equal(app.calls.filter((id) => id === 'task-a').length, 1);
  app.unmount();
});

test('duplicate completion and stale running snapshots cannot cancel or duplicate result navigation', async () => {
  const app = harness(taskFile);
  let resolvePoll!: (value: unknown) => void;
  app.api.getTask = () => new Promise((resolve) => { resolvePoll = resolve; });
  app.render(); await app.flush();
  const ws = app.sockets[0];
  const complete = { data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'review-a') }) };
  ws.onmessage(complete); app.render(); app.advance(200);
  ws.onmessage(complete);
  resolvePoll(task('task-a', 'RUNNING')); await app.flush();
  assert.equal(app.find((node) => node.props?.href === '/reviews/review-a').props.href, '/reviews/review-a');
  app.advance(1000); app.advance(2000);
  assert.deepEqual(app.pushes, ['/reviews/review-a']);
  app.unmount();
});

test('revisiting a completed task schedules its result and leaving cancels the pending redirect', async () => {
  const app = harness(taskFile);
  app.api.getTask = async (id: string) => task(id, 'SUCCEEDED', 'review-a');
  app.render(); await app.flush();
  assert.equal(app.find((node) => node.props?.href === '/reviews/review-a').props.href, '/reviews/review-a');
  app.unmount(); app.advance(1000);
  assert.deepEqual(app.pushes, []);
  const revisit = harness(taskFile);
  revisit.api.getTask = async (id: string) => task(id, 'SUCCEEDED', 'review-a');
  revisit.render(); await revisit.flush(); revisit.advance(1000);
  assert.deepEqual(revisit.pushes, ['/reviews/review-a']);
  revisit.unmount();
});

test('practice page keeps the draft panel mounted throughout localized guidance refresh and failure', async () => {
  const app = harness('../src/app/account/practice/page.tsx', {
    '@/features/practice/components/PracticeStartPanel': { __esModule: true, default: 'PracticeStartPanel' },
    '@/features/practice/usePracticeEnabled': { usePracticeEnabled: () => true },
    '@/features/practice/guidance': {
      getPracticeGuidanceCopy: () => ({}), guidanceLevelMessage: () => '', guidanceLevelReasonLabel: () => '',
    },
  }, 'PracticeAccountContent');
  app.api.getPracticeGuidanceProfile = async () => ({ templates: [template], observations: [] });
  app.api.getPracticeRecommendations = async () => ({ recommendations: [] });
  app.api.getPracticeSessions = async () => ({ items: [], next_cursor: null });
  app.render(); await app.flush();
  assert.equal(app.find((node) => node.type === 'PracticeStartPanel').type, 'PracticeStartPanel');
  let rejectRefresh!: (error: Error) => void;
  app.api.getPracticeSessions = () => new Promise((_resolve, reject) => { rejectRefresh = reject; });
  app.setLocale('ja'); await app.flush();
  assert.equal(app.find((node) => node.type === 'PracticeStartPanel').type, 'PracticeStartPanel');
  rejectRefresh(new Error('offline')); await app.flush();
  assert.equal(app.find((node) => node.type === 'PracticeStartPanel').type, 'PracticeStartPanel');
  app.unmount();
});


test('practice account identity keys reset all private history and draft state, not locale changes', () => {
  const app = harness('../src/app/account/practice/page.tsx');
  assert.equal(app.render().key, 'user-a');
  app.setLocale('ja');
  assert.equal(app.render().key, 'user-a');
  app.setIdentity('user-b');
  assert.equal(app.render().key, 'user-b');
  app.unmount();
});

test('a practice save that resolves after leaving or switching accounts cannot navigate the new page', async () => {
  const app = harness(practiceFile);
  let resolveSave!: (value: unknown) => void;
  app.api.createPracticeSession = () => new Promise((resolve) => { resolveSave = resolve; });
  app.render(); await app.flush();
  app.find((node) => node.type === 'button' && node.props.children === 'Save practice and upload photo').props.onClick();
  await app.flush(); app.unmount();
  resolveSave({ session_id: 'old-private-session' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(app.pushes, []);
});


test('successful practice saves stay locked while navigation is pending', async () => {
  const app = harness(practiceFile); app.render(); await app.flush();
  const save = app.find((node) => node.type === 'button' && node.props.children === 'Save practice and upload photo');
  save.props.onClick(); await app.flush();
  save.props.onClick(); await app.flush();
  assert.equal(app.calls.filter((call) => call.startsWith('save:')).length, 1);
  assert.deepEqual(app.pushes, ['/workspace?practice_session_id=session-a']);
  assert.equal(app.find((node) => node.type === 'button' && node.props.children === 'Saving practice…').props.disabled, true);
  app.unmount();
});


test('same-owner token refresh does not cancel a completed review while changing accounts does', async () => {
  const app = harness(taskFile); app.render(); await app.flush();
  app.sockets[0].onmessage({ data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'review-a') }) });
  app.render(); app.advance(200); app.refreshTokenGetter(); app.advance(1000);
  assert.deepEqual(app.pushes, ['/reviews/review-a']);
  assert.equal(app.calls.length, 1);
  app.unmount();
  const changed = harness(taskFile); changed.render(); await changed.flush();
  changed.sockets[0].onmessage({ data: JSON.stringify({ task: task('task-a', 'SUCCEEDED', 'old-private-result') }) });
  changed.render(); changed.advance(200); changed.setIdentity('user-b');
  await changed.flush(); changed.advance(1000);
  assert.deepEqual(changed.pushes, []);
  changed.unmount();
});


function practiceAccountHarness() {
  const app = harness('../src/app/account/practice/page.tsx', {
    '@/features/practice/components/PracticeStartPanel': { __esModule: true, default: 'PracticeStartPanel' },
    '@/features/practice/usePracticeEnabled': { usePracticeEnabled: () => true },
    '@/features/practice/guidance': {
      getPracticeGuidanceCopy: () => new Proxy({}, { get: (_target, key) => key }),
      guidanceDimensionLabel: () => 'Composition', guidanceLevelMessage: () => '', guidanceLevelReasonLabel: () => '',
      localizePracticeDimensionText: (value: string) => value, recommendationActionLabel: () => 'Accept recommendation',
    },
  }, 'PracticeAccountContent');
  app.api.getPracticeGuidanceProfile = async () => ({ templates: [], observations: [] });
  app.api.getPracticeRecommendations = async () => ({ recommendations: [{ recommendation_id: 'rec-a', accept_available: true,
    goal_snapshot: { goal: 'Keep the subject separated' },
    accept_payload: { source_review_id: 'review-a', goal_snapshot: { goal: 'Keep the subject separated', dimension: 'composition' }, success_criteria: [{ label: 'Separate the edge' }], locale: 'en', practice_kind: 'edit_revision' },
  }] });
  app.api.getPracticeSessions = async () => { app.calls.push('sessions'); return { items: [{ session_id: 'session-a', dimension: 'composition', goal: 'Original goal', created_at: '2026-10-01', attempt_count: 0, scene_group: 'Original scene' }], next_cursor: null }; };
  return app;
}

test('practice recommendations cannot duplicate acceptance or navigate after their account subtree unmounts', async () => {
  const app = practiceAccountHarness();
  let resolve!: (value: unknown) => void;
  app.api.createPracticeSession = async () => { app.calls.push('accept'); return new Promise((done) => { resolve = done; }); };
  app.render(); await app.flush();
  const accept = app.find((node) => node.type === 'button' && node.props.children === 'Accept recommendation');
  accept.props.onClick(); accept.props.onClick(); await app.flush();
  assert.equal(app.calls.filter((call) => call === 'accept').length, 1);
  app.unmount(); resolve({ session_id: 'old-account-session' }); await new Promise((done) => setImmediate(done));
  assert.deepEqual(app.pushes, []);
});

test('scene saves cannot duplicate writes or refresh an unmounted account subtree', async () => {
  const app = practiceAccountHarness();
  let resolve!: () => void;
  app.api.updatePracticeSceneGroup = async () => { app.calls.push('scene'); return new Promise<void>((done) => { resolve = done; }); };
  app.render(); await app.flush();
  const save = app.find((node) => node.type === 'button' && JSON.stringify(node.props.children).includes('\"sceneGroupSave\"'));
  save.props.onClick(); save.props.onClick(); await app.flush();
  assert.equal(app.calls.filter((call) => call === 'scene').length, 1);
  app.unmount(); resolve(); await new Promise((done) => setImmediate(done));
  assert.equal(app.calls.filter((call) => call === 'sessions').length, 1);
});

for (const action of ['accept', 'scene'] as const) {
  const actionButton = (app: ReturnType<typeof practiceAccountHarness>) => app.find((node) => node.type === 'button' && (action === 'accept'
    ? node.props.children === 'Accept recommendation'
    : JSON.stringify(node.props.children).includes('"sceneGroupSave"')));

  test(`practice ${action} accepts a renewed same-owner token`, async () => {
    const tokens: string[] = [];
    const app = practiceAccountHarness();
    app.api.createPracticeSession = async (_payload: unknown, token: string) => { tokens.push(token); return { session_id: 'fresh-session' }; };
    app.api.updatePracticeSceneGroup = async (_id: string, _payload: unknown, token: string) => { tokens.push(token); };
    app.render(); await app.flush(); app.renewToken();
    await actionButton(app).props.onClick(); await app.flush();
    assert.deepEqual(tokens, ['renewed-token']);
    if (action === 'accept') assert.deepEqual(app.pushes, ['/workspace?practice_session_id=fresh-session']);
    else assert.equal(app.calls.filter((call) => call === 'sessions').length, 2);
    app.unmount();
  });

  for (const timing of ['during-auth', 'late-response'] as const) {
    test(`practice ${action} aborts a confirmed owner switch ${timing} before React rerenders`, async () => {
      const token = deferred<string>(); const response = deferred<any>(); const called = deferred<void>();
      let writes = 0;
      const app = practiceAccountHarness();
      const write = async () => { writes++; called.resolve(); return response.promise; };
      app.api.createPracticeSession = write; app.api.updatePracticeSceneGroup = write;
      app.render(); await app.flush();
      if (timing === 'during-auth') app.holdToken(token.promise);
      const pending = actionButton(app).props.onClick();
      if (timing === 'late-response') await called.promise;
      app.setIdentity('user-b', false);
      token.resolve('user-b-token'); response.resolve({ session_id: 'old-session' });
      await pending; await new Promise((resolve) => setImmediate(resolve));
      assert.equal(writes, timing === 'late-response' ? 1 : 0);
      assert.deepEqual(app.pushes, []);
      assert.equal(app.calls.filter((call) => call === 'sessions').length, 1);
      app.unmount();
    });
  }
}

for (const action of ['accept', 'scene'] as const) {
  test(`practice ${action} unlocks after a discarded A-to-B-to-A result`, async () => {
    const response = deferred<any>(); const called = deferred<void>(); let writes = 0;
    const app = practiceAccountHarness();
    const write = async () => { writes++; called.resolve(); return response.promise; };
    app.api.createPracticeSession = write; app.api.updatePracticeSceneGroup = write;
    app.render(); await app.flush();
    const button = () => app.find((node) => node.type === 'button' && (action === 'accept'
      ? node.props.children === 'Accept recommendation'
      : JSON.stringify(node.props.children).includes('"sceneGroupSave"')));
    const pending = button().props.onClick(); await called.promise;
    app.setIdentity('user-b', false); app.setIdentity('user-a', false);
    response.resolve({ session_id: 'retry-session' }); await pending; await new Promise((resolve) => setImmediate(resolve)); app.render();
    assert.deepEqual(app.pushes, []);
    assert.equal(button().props.disabled, false);
    await button().props.onClick(); await new Promise((resolve) => setImmediate(resolve));
    assert.equal(writes, 2);
    app.unmount();
  });
}
