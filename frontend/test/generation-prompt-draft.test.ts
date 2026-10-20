import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as generationRequest from '../src/features/generations/generation-request.ts';

const compiled = ts.transpileModule(
  fs.readFileSync(new URL('../src/app/generate/GeneratePageClient.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
).outputText;

type Slot = { value?: unknown; deps?: unknown[] };
type Node = { type: string; props: Record<string, any> };
const example = { id: 'example', category: 'portrait', suggestedTemplateKey: 'portrait_avatar', suggestedStyle: 'editorial', suggestedSize: '1024x1024' };

function harness(search = '') {
  const slots: Slot[] = [];
  let cursor = 0;
  let changed = false;
  let locale = 'en';
  let effects: (() => void)[] = [];
  let submitted: Record<string, unknown> | undefined;
  const memo = (factory: () => unknown, deps: unknown[]) => {
    const index = cursor++;
    if (!slots[index]?.deps || deps.some((value, i) => !Object.is(value, slots[index].deps?.[i]))) {
      slots[index] = { value: factory(), deps };
    }
    return slots[index].value;
  };
  const jsx = (type: string, props: Node['props']) => ({ type, props });
  const t = (key: string) => `${locale}:${key}`;
  const templateCopyKey = (key: string) => ({ prompt: `${key}.prompt`, label: `${key}.label` });
  const modules: Record<string, unknown> = {
    react: {
      useState(initial: unknown) {
        const index = cursor++;
        slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
        return [slots[index].value, (value: unknown) => {
          const next = typeof value === 'function' ? value(slots[index].value) : value;
          changed ||= !Object.is(next, slots[index].value);
          slots[index].value = next;
        }];
      },
      useRef: (initial: unknown) => memo(() => ({ current: initial }), []),
      useMemo: memo,
      useCallback: (callback: unknown, deps: unknown[]) => memo(() => callback, deps),
      useEffect(callback: () => void, deps: unknown[]) {
        const index = cursor++;
        if (!slots[index]?.deps || deps.some((value, i) => !Object.is(value, slots[index].deps?.[i]))) {
          slots[index] = { deps };
          effects.push(callback);
        }
      },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/image': { default: 'Image' },
    'next/link': { default: 'Link' },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    'lucide-react': { AlertCircle: 'AlertCircle', ImageIcon: 'ImageIcon' },
    '@clerk/nextjs': { SignInButton: 'SignInButton' },
    '@/lib/auth-context': { useAuth: () => ({ token: 'token', ensureToken: async () => 'token', captureAuthOwner: () => () => true, userInfo: { plan: 'pro', user_id: 'generation-draft-user' }, isLoading: false }) },
    '@/lib/i18n': { useI18n: () => ({ locale, t }) },
    '@/lib/api': {
      getGenerationTemplates: async () => ({ credits_table: { medium: { '1024x1536': 2, '1024x1024': 2 } } }),
      getMyGenerations: async () => ({ items: [] }),
      createGeneration: async (payload: Record<string, unknown>) => { submitted = payload; return { task_id: 'task' }; },
    },
    '@/features/generations/generation-request': generationRequest,
    '@/lib/types': { ApiException: class extends Error {} },
    '@/lib/error-utils': { formatUserFacingError: () => 'error' },
    '@/lib/product-analytics': { trackProductEvent() {}, readProductAttributionSource: () => undefined },
    '@/lib/hooks/useCreditPackCheckout': { useCreditPackCheckout: () => ({ busy: false }) },
    '@/lib/pro-checkout': {},
    '@/features/generations/generation-config': {
      getTemplateByKey: (key: string) => ({ key, intent: key }),
      estimateGenerationCredits: () => 2,
      formatGenerationOutputSpec: () => 'output',
    },
    '@/features/generations/generation-page-copy': {
      templateCopyKey,
      TEMPLATE_COPY_KEYS: { photo_inspiration: templateCopyKey('photo_inspiration') },
      QUALITY_COPY_KEYS: { medium: { label: 'medium' }, low: { label: 'low' }, high: { label: 'high' } },
      generationCtaKey: () => 'generate',
    },
    '@/content/generation/prompt-examples': {
      getGenerationPromptExample: (id: string) => id === example.id ? example : undefined,
      getPromptExamplePromptPresentation: (_example: unknown, language: string) => ({ text: `${language}:example prompt` }),
    },
  };
  for (const component of ['GenerateFormPanel', 'GenerationPricingGrid', 'GeneratePageHeader']) {
    modules[`@/features/generations/components/${component}`] = { default: component };
  }
  modules['@/features/generations/components/PromptExampleGallery'] = { PromptExampleGallery: 'PromptExampleGallery' };
  const exports: { default?: () => Node } = {};
  // These draft/locale cases exercise the form; keyed account lifetimes are
  // covered by generation-submit-recovery's component harness.
  vm.runInNewContext(compiled + '\nexports.default = GeneratePageContent;', {
    exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; },
    URLSearchParams,
    window: { location: { search }, requestAnimationFrame: (callback: () => void) => callback() },
  });
  const find = (node: Node | Node[] | undefined, predicate: (node: Node) => boolean): Node | undefined => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) { const result = find(child, predicate); if (result) return result; }
      return;
    }
    return predicate(node) ? node : find(node.props?.children, predicate);
  };
  function render(nextLocale = locale) {
    locale = nextLocale;
    let tree: Node;
    let count = 0;
    do {
      cursor = 0;
      changed = false;
      effects = [];
      tree = exports.default!();
      effects.forEach((effect) => effect());
      assert.ok(++count < 20, 'component settles');
    } while (changed);
    return {
      form: find(tree!, (node) => node.type === 'GenerateFormPanel')!.props,
      gallery: find(tree!, (node) => node.type === 'PromptExampleGallery')!.props,
      submit: find(tree!, (node) => node.type === 'button' && node.props.children === t('generate'))!.props.onClick,
    };
  }
  return { render, get submitted() { return submitted; } };
}

test('untouched template defaults translate; edited and cleared prompts survive locale changes', () => {
  const app = harness();
  assert.equal(app.render().form.prompt, 'en:photo_inspiration.prompt');
  assert.equal(app.render('zh').form.prompt, 'zh:photo_inspiration.prompt');
  app.render().form.onPromptChange('my revised prompt');
  assert.equal(app.render('ja').form.prompt, 'my revised prompt');
  app.render().form.onPromptChange('');
  assert.equal(app.render('en').form.prompt, '');
  app.render().form.onTemplateSelect('social_visual');
  assert.equal(app.render().form.prompt, 'en:social_visual.prompt');
  assert.equal(app.render('zh').form.prompt, 'zh:social_visual.prompt');
});

for (const source of ['gallery', 'url']) {
  test(`${source} example draft, settings and attribution survive repeated locale changes`, async () => {
    const app = harness(source === 'url' ? '?prompt_example_id=example' : '');
    if (source === 'gallery') app.render().gallery.onApply(example);
    else app.render();
    await new Promise((resolve) => setImmediate(resolve));
    for (const locale of ['zh', 'ja', 'en']) {
      const { form } = app.render(locale);
      assert.equal(form.prompt, 'en:example prompt');
      assert.equal(form.templateKey, example.suggestedTemplateKey);
      assert.equal(form.style, example.suggestedStyle);
      assert.equal(form.size, example.suggestedSize);
    }
    await app.render().submit();
    assert.equal(app.submitted?.prompt, 'en:example prompt');
    assert.equal(app.submitted?.prompt_example_id, example.id);
    assert.equal(app.submitted?.prompt_example_category, example.category);
    app.render().form.onPromptChange('edited example');
    assert.equal(app.render('zh').form.prompt, 'edited example');
    const returned = harness();
    returned.render('zh').gallery.onApply(example);
    returned.render().form.onTemplateSelect('portrait_avatar');
    await new Promise((resolve) => setImmediate(resolve));
    await returned.render().submit();
    assert.equal(returned.submitted?.prompt, 'zh:portrait_avatar.prompt');
    assert.equal(returned.submitted?.prompt_example_id, null);
  });
}
