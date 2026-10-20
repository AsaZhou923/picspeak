import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { getProfileCopy, type ProfileLocale } from '../src/features/profile/profile-copy.ts';

type Plan = 'guest' | 'free' | 'pro';

// A parent AuthProvider can restore session storage while the account Suspense
// boundary still waits for its page chunk. Keep its first render separate from
// passive effects, which the ordinary component harness runs immediately.
function profile(locale: ProfileLocale, plan: Plan | null) {
  let cursor = 0;
  const slots: any[] = [];
  const effects: (() => void)[] = [];
  const output: Record<string, any> = {};
  const jsx = (type: any, props: any) => ({ type, props });
  const modules: Record<string, any> = {
    react: {
      useState(initial: any) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (next: any) => { slots[index] = next; }];
      },
      useRef(initial: any) {
        const index = cursor++;
        slots[index] ??= { current: initial };
        return slots[index];
      },
      useMemo: (factory: () => any) => factory(),
      useEffect(effect: () => void) { effects.push(effect); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/image': { default: 'Image' }, 'next/link': { default: 'Link' }, 'lucide-react': {},
    '@/components/auth/ClerkSignInTrigger': { default: 'ClerkSignInTrigger' },
    '@/lib/auth-context': { useAuth: () => ({
      userInfo: plan ? { user_id: `owner-${plan}`, plan, access_token: `${plan}-token` } : null,
      ensureToken: () => new Promise(() => {}),
    }) },
    '@/lib/i18n': { useI18n: () => ({ locale, t: (key: string) => key }) },
    '@/lib/error-utils': { formatUserFacingError: () => 'error' },
    '@/features/profile/api': { ProfileApiError: class extends Error {} },
    '@/features/profile/profile-copy': { getProfileCopy },
  };
  const source = fs.readFileSync(new URL('../src/app/account/profile/page.tsx', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: output, AbortController, require: (name: string) => modules[name] });
  return {
    render() { cursor = 0; return JSON.stringify(output.default()); },
    hydrate() { effects.splice(0).forEach(effect => effect()); },
  };
}

for (const locale of ['en', 'zh', 'ja'] as const) {
  for (const plan of ['guest', 'free', 'pro'] as const) {
    test(`profile: restored ${plan} ${locale} first hydration matches unauthenticated SSR`, () => {
      const server = profile(locale, null).render();
      const client = profile(locale, plan);
      assert.equal(client.render(), server);
      assert.doesNotMatch(server, /ClerkSignInTrigger/);
      assert.match(server, /"disabled":true/);
      client.hydrate();
      const hydrated = client.render();
      if (plan === 'guest') {
        assert.match(hydrated, /ClerkSignInTrigger/);
        assert.ok(hydrated.includes(getProfileCopy(locale).signinHint));
      } else {
        assert.doesNotMatch(hydrated, /ClerkSignInTrigger/);
        assert.ok(hydrated.includes(getProfileCopy(locale).enable));
        // Auth restoration alone must not enable publishing before settings load.
        assert.match(hydrated, /"disabled":true/);
      }
    });
  }
}
