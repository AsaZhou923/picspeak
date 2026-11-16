import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { deferred, settle } from './helpers/component-harness.ts';

function readFrontendFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

test('usePracticeEnabled deduplicates concurrent callers, caches the result, and survives first-caller unmount', async () => {
  let requests = 0;
  let pending = deferred<{ practice_enabled: boolean }>();

  const compiled = ts.transpileModule(readFrontendFile('src/features/practice/usePracticeEnabled.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  type HookSlot = { state?: any; effect?: () => void | (() => void); ran?: boolean };
  const consumers = new Map<string, HookSlot>();
  let activeConsumer = '';

  const exports: Record<string, any> = {};
  vm.runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === 'react') {
        return {
          useState(initial: any) {
            const slot = consumers.get(activeConsumer)!;
            if (!('state' in slot)) {
              slot.state = typeof initial === 'function' ? initial() : initial;
            }
            const targetName = activeConsumer;
            return [
              slot.state,
              (value: any) => {
                const target = consumers.get(targetName);
                if (target) {
                  target.state = typeof value === 'function' ? value(target.state) : value;
                }
              },
            ];
          },
          useEffect(fn: () => void | (() => void)) {
            const slot = consumers.get(activeConsumer)!;
            if (!slot.ran) {
              slot.ran = true;
              slot.effect = fn;
            }
          },
        };
      }
      if (name === '@/lib/api') {
        return {
          getPracticeConfig: () => {
            requests += 1;
            return pending.promise;
          },
        };
      }
      throw new Error(`Unexpected import: ${name}`);
    },
  });

  const mountConsumer = (name: string) => {
    consumers.set(name, {});
    activeConsumer = name;
    const initialValue = exports.usePracticeEnabled();
    const slot = consumers.get(name)!;
    const cleanup = slot.effect?.();
    return {
      read: () => {
        activeConsumer = name;
        return exports.usePracticeEnabled();
      },
      initialValue,
      unmount: () => {
        if (typeof cleanup === 'function') cleanup();
        consumers.delete(name);
      },
    };
  };

  exports.resetPracticeEnabledCacheForTests();
  const header = mountConsumer('header');
  const home = mountConsumer('home');
  assert.equal(header.initialValue, null);
  assert.equal(home.initialValue, null);
  assert.equal(requests, 1, 'concurrent callers must share a single /practice/config request');

  header.unmount();
  pending.resolve({ practice_enabled: true });
  await settle();
  assert.equal(home.read(), true, 'unmounting the first caller must not drop the shared result');

  const lateMount = mountConsumer('late');
  assert.equal(lateMount.initialValue, true, 'cached value must be available synchronously to later callers');
  assert.equal(requests, 1, 'later callers must reuse the cached config without refetching');

  exports.resetPracticeEnabledCacheForTests();
  pending = deferred<{ practice_enabled: boolean }>();
  pending.reject(new Error('network error'));
  const retryMount = mountConsumer('retry');
  await settle();
  assert.equal(retryMount.read(), false);

  pending = deferred<{ practice_enabled: boolean }>();
  const afterFailure = mountConsumer('afterFailure');
  assert.equal(requests, 3, 'a failed fetch must not lock out future retries');
  pending.resolve({ practice_enabled: true });
  await settle();
  assert.equal(afterFailure.read(), true);
});

test('first-paint requests use local hero image, lazy footer badge, and non-wrapping analytics boundary', () => {
  const artifactSource = readFrontendFile('src/components/home/HomeCritiqueArtifact.tsx');
  assert.match(artifactSource, /import demoGinkgoImage from ['"]\.\.\/\.\.\/\.\.\/public\/demo-ginkgo\.jpg['"]/);
  assert.match(artifactSource, /src=\{demoGinkgoImage\}/);
  assert.match(artifactSource, /placeholder="blur"/);
  assert.doesNotMatch(artifactSource, /DEMO_IMAGE_URL/);

  const appProvidersSource = readFrontendFile('src/components/providers/AppProviders.tsx');
  assert.match(appProvidersSource, /<ProductAnalyticsProvider>\{null\}<\/ProductAnalyticsProvider>\s*<\/Suspense>\s*\{children\}/);

  const footerSource = readFrontendFile('src/components/layout/Footer.tsx');
  assert.match(footerSource, /src=\{PRODUCT_HUNT_BADGE_SRC\}[\s\S]*?loading="lazy"/);
  assert.match(footerSource, /className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold\/25 bg-gold\/10 text-xs font-semibold uppercase tracking-\[0\.18em\] text-ink"/);
});

test('accessibility and mobile workspace step regressions stay fixed', () => {
  const uploaderSource = readFrontendFile('src/components/upload/ImageUploader.tsx');
  assert.match(uploaderSource, /\{error && \(\s*<div\s+role="alert"/);
  assert.match(uploaderSource, /min-h-6 min-w-6/);

  const retakeSource = readFrontendFile('src/app/retake/page.tsx');
  assert.match(retakeSource, /role="status"\s+aria-busy="true"\s+aria-label=\{copy\.loading\}/);
  assert.match(retakeSource, /<span className="sr-only">\{copy\.loading\}<\/span>/);

  const reviewPageSource = readFrontendFile('src/app/reviews/[reviewId]/page.tsx');
  assert.match(reviewPageSource, /const UnavailableHeading = isDemoReview \? 'h2' : 'h1'/);
  assert.match(reviewPageSource, /\{!isDemoReview && <h1 className="sr-only">\{t\('nav_critique'\)\}<\/h1>\}/);
  assert.match(reviewPageSource, /<UnavailableHeading className=/);

  const workspaceShellSource = readFrontendFile('src/features/workspace/components/WorkspaceTaskShell.tsx');
  assert.match(workspaceShellSource, /break-words text-xs font-bold leading-snug sm:truncate sm:text-sm/);
});
