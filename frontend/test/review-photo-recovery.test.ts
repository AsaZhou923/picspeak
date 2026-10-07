import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/features/reviews/hooks/useReviewPhoto.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Review = { review_id: string; photo_id: string; photo_url: string };
type Hook = { photoUrl: string | null; photoError: boolean; handlePhotoError: () => Promise<void> };
type Slot = { value?: unknown; deps?: unknown[]; cleanup?: () => void };

function harness(options: {
  fetchReview?: (id: string, signal: AbortSignal) => Promise<Review>;
  refreshLocal?: () => Promise<string | null>;
} = {}) {
  const slots: Slot[] = [];
  let cursor = 0;
  let changed = false;
  let effects: (() => void)[] = [];
  let review: Review;
  let requests = 0;
  let localRefreshes = 0;
  const react = {
    useState(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (value: unknown) => {
        const next = typeof value === 'function' ? value(slots[index].value) : value;
        if (!Object.is(slots[index].value, next)) changed = true;
        slots[index].value = next;
      }];
    },
    useRef(initial: unknown) {
      const index = cursor++;
      slots[index] ??= { value: { current: initial } };
      return slots[index].value;
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous?.deps || deps.some((item, i) => !Object.is(item, previous.deps?.[i]))) {
        slots[index] = { value: callback, deps };
      }
      return slots[index].value;
    },
    useEffect(callback: () => (() => void) | undefined, deps: unknown[]) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous?.deps || deps.some((item, i) => !Object.is(item, previous.deps?.[i]))) {
        effects.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: callback() };
        });
      }
    },
  };
  const ensureToken = async () => 'local-test';
  const modules: Record<string, unknown> = {
    react,
    '@/lib/api': {
      async getReview(id: string, _token: string, signal: AbortSignal) {
        requests++;
        return options.fetchReview ? options.fetchReview(id, signal) : review;
      },
      isAbortError: (error: Error) => error.name === 'AbortError',
    },
    '@/lib/auth-context': { useAuth: () => ({ ensureToken }) },
    '@/lib/photo-preview-cache': { async refreshUploadedPhotoPreviewSrc() {
      localRefreshes++;
      return options.refreshLocal ? options.refreshLocal() : null;
    } },
    '@/lib/client-log': { logClientError() {} },
  };
  const exports: { useReviewPhoto?: (props: unknown) => Hook } = {};
  vm.runInNewContext(compiled, {
    exports, require: (name: string) => modules[name], Date, AbortController,
    window: { addEventListener() {}, removeEventListener() {} },
  });
  const setReview = (next: Review) => { review = next; };
  function render(nextReview?: Review): Hook {
    if (nextReview) review = nextReview;
    let hook: Hook;
    let renders = 0;
    do {
      changed = false;
      cursor = 0;
      effects = [];
      hook = exports.useReviewPhoto!({ review, setReview, initialPhotoUrl: review.photo_url });
      for (const effect of effects) effect();
      assert.ok(++renders < 20, 'hook must settle without a render loop');
    } while (changed);
    return hook;
  }
  return { render, get requests() { return requests; }, get localRefreshes() { return localRefreshes; } };
}

const photo = (id: string): Review => ({ review_id: id, photo_id: `photo-${id}`, photo_url: `https://example.test/${id}.jpg` });

test('simultaneous image errors share one recovery request before React rerenders', async () => {
  const app = harness();
  const hook = app.render(photo('a'));
  await Promise.all([hook.handlePhotoError(), hook.handlePhotoError()]);
  assert.equal(app.requests, 1);
  assert.equal(app.localRefreshes, 1);
  assert.equal(app.render().photoError, false);
});

test('local preview failures end recovery without leaving it in progress', async () => {
  const app = harness({ refreshLocal: async () => { throw new Error('preview unavailable'); } });
  await app.render(photo('a')).handlePhotoError();
  assert.equal(app.render().photoError, true);
  assert.equal(app.requests, 0);
});

test('a permanently unavailable image gets one recovery request and then an error state', async () => {
  const app = harness();
  let hook = app.render(photo('a'));
  for (let attempt = 0; attempt < 4; attempt++) {
    await hook.handlePhotoError();
    hook = app.render();
  }
  assert.equal(app.requests, 1);
  assert.equal(hook.photoError, true);
});

test('a broken local cached preview cannot cause an endless recovery loop', async () => {
  const app = harness({ refreshLocal: async () => 'blob:broken' });
  let hook = app.render(photo('a'));
  for (let attempt = 0; attempt < 3; attempt++) {
    await hook.handlePhotoError();
    hook = app.render();
  }
  assert.equal(app.localRefreshes, 1);
  assert.equal(app.requests, 0);
  assert.equal(hook.photoError, true);
});

test('changing reviews resets the recovery budget and displayed photo', async () => {
  const app = harness();
  await app.render(photo('a')).handlePhotoError();
  await app.render().handlePhotoError();
  let next = app.render(photo('b'));
  assert.equal(next.photoUrl, photo('b').photo_url);
  assert.equal(next.photoError, false);
  await next.handlePhotoError();
  next = app.render();
  assert.equal(app.requests, 2);
  assert.equal(next.photoError, false);
});

test('a delayed recovery for the previous review is aborted and cannot replace the current image', async () => {
  let resolve!: (review: Review) => void;
  let signal!: AbortSignal;
  const app = harness({ fetchReview: (_id, currentSignal) => {
    signal = currentSignal;
    return new Promise<Review>((done) => { resolve = done; });
  } });
  const pending = app.render(photo('a')).handlePhotoError();
  await new Promise((done) => setImmediate(done));
  app.render(photo('b'));
  assert.equal(signal.aborted, true);
  resolve(photo('a'));
  await pending;
  const current = app.render();
  assert.equal(current.photoUrl, photo('b').photo_url);
  assert.equal(current.photoError, false);
});
