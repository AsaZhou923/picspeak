import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export type TestNode = { type: string | ((props: any) => TestNode); props: Record<string, any>; key?: string };
type Slot = { value?: any; deps?: unknown[]; cleanup?: () => void };
type Frame = { slots: Slot[]; cursor: number };

/** Executes component hooks, effects and keyed child lifetimes without a browser dependency. */
export function componentHarness(source: URL, modules: Record<string, any>, globals: Record<string, any> = {}) {
  const frames = new Map<string, Frame>();
  let frame: Frame;
  let dirty = false;
  let effects: Array<() => void> = [];
  let tree: TestNode;
  const memo = (factory: () => any, deps: unknown[]) => {
    const index = frame.cursor++;
    if (!frame.slots[index]?.deps || deps.some((value, i) => !Object.is(value, frame.slots[index].deps?.[i]))) {
      frame.slots[index] = { value: factory(), deps };
    }
    return frame.slots[index].value;
  };
  const jsx = (type: TestNode['type'], props: TestNode['props'], key?: string) => ({ type, props, key });
  const exports: Record<string, any> = {};
  const compiled = ts.transpileModule(fs.readFileSync(source, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, URLSearchParams, AbortController,
    window: { setTimeout: () => 0, location: { search: '' }, requestAnimationFrame: (fn: () => void) => fn() },
    ...globals,
    require(name: string) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'react') return {
        useState(initial: any) {
          const target = frame;
          const index = target.cursor++;
          target.slots[index] ??= { value: typeof initial === 'function' ? initial() : initial };
          return [target.slots[index].value, (value: any) => {
            const next = typeof value === 'function' ? value(target.slots[index].value) : value;
            dirty ||= !Object.is(next, target.slots[index].value);
            target.slots[index].value = next;
          }];
        },
        useRef: (value: any) => memo(() => ({ current: value }), []),
        useMemo: memo,
        useCallback: (fn: any, deps: unknown[]) => memo(() => fn, deps),
        useEffect(fn: () => void | (() => void), deps: unknown[]) {
          const target = frame;
          const index = target.cursor++;
          const previous = target.slots[index];
          if (!previous?.deps || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
            const slot: Slot = { deps };
            target.slots[index] = slot;
            effects.push(() => { previous?.cleanup?.(); slot.cleanup = fn() ?? undefined; });
          }
        },
      };
      assert.ok(name in modules, `missing module ${name}`);
      return modules[name];
    },
  });
  function render(props: any = {}, exportName = 'default') {
    let turns = 0;
    do {
      dirty = false;
      effects = [];
      const used = new Set<string>();
      const visit = (node: any, path: string): any => {
        if (Array.isArray(node)) return node.map((child, i) => visit(child, `${path}.${child?.key ?? i}`));
        if (!node || typeof node !== 'object') return node;
        if (typeof node.type === 'function') {
          const id = `${path}:${node.key ?? ''}:${node.type.name}`;
          used.add(id);
          if (!frames.has(id)) frames.set(id, { slots: [], cursor: 0 });
          frame = frames.get(id)!;
          frame.cursor = 0;
          return visit(node.type(node.props), `${id}.child`);
        }
        return { ...node, props: { ...node.props, children: visit(node.props?.children, `${path}.children`) } };
      };
      tree = visit({ type: exports[exportName], props }, 'root');
      for (const [key, old] of frames) {
        if (!used.has(key)) { old.slots.forEach((slot) => slot.cleanup?.()); frames.delete(key); }
      }
      effects.forEach((effect) => effect());
      assert.ok(++turns < 30, 'component must settle');
    } while (dirty);
    return tree;
  }
  function nodes(predicate: (node: TestNode) => boolean): TestNode[] {
    const found: TestNode[] = [];
    const walk = (node: any) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (predicate(node)) found.push(node);
      walk(node.props?.children);
    };
    walk(tree);
    return found;
  }
  return { render, nodes, text: () => JSON.stringify(tree), unmount: () => { frames.forEach((old) => old.slots.forEach((slot) => slot.cleanup?.())); frames.clear(); } };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
export const settle = () => new Promise((resolve) => setImmediate(resolve));
