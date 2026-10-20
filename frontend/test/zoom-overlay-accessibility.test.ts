import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness } from './helpers/component-harness.ts';

test('zoom overlay traps focus around the image and every toolbar control', () => {
  const trapRef = { current: null };
  let trapOptions: any;
  let closed = 0;
  const app = componentHarness(new URL('../src/features/reviews/components/ImageZoomOverlay.tsx', import.meta.url), {
    'lucide-react': {}, '@/lib/hooks/useModalFocusTrap': { useModalFocusTrap: (options: any) => { trapOptions = options; return trapRef; } },
  });
  const props = { zoomMounted: true, zoomOpen: true, photoUrl: 'http://localhost/photo.png', onClose: () => closed++, t: (key: string) => key };
  app.render(props, 'ImageZoomOverlay');
  const dialog = app.nodes(node => node.props.role === 'dialog')[0];
  assert.equal(dialog.props.ref, trapRef);
  assert.equal(dialog.props['aria-modal'], 'true');
  const descendants: any[] = [];
  function visit(node: any) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== 'object') return;
    descendants.push(node); visit(node.props?.children);
  }
  visit(dialog.props.children);
  const controls = descendants.filter(node => node.type === 'button');
  assert.equal(controls.length, 4, 'Close, minus, plus, reset must all be inside focus trap');
  assert.ok(controls.some(node => node.props.ref === trapOptions.initialFocusRef));
  assert.ok(descendants.some(node => node.type === 'img'));
  assert.equal(trapOptions.open, true);
  trapOptions.onClose(); assert.equal(closed, 1);
  app.unmount();
});
