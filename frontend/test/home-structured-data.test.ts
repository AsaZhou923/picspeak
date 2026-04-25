import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderHomeFaqJsonLd } from '../src/lib/home-structured-data.ts';

test('root homepage renders FAQPage JSON-LD for rich results', () => {
  assert.equal(shouldRenderHomeFaqJsonLd('root'), true);
});

test('locale homepage suppresses nested FAQPage JSON-LD because locale layout owns it', () => {
  assert.equal(shouldRenderHomeFaqJsonLd('locale'), false);
});
