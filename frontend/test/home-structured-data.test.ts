import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRenderHomeFaqJsonLd } from '../src/lib/home-structured-data.ts';
import { serializeJsonLd } from '../src/lib/json-ld.ts';

test('root homepage renders FAQPage JSON-LD for rich results', () => {
  assert.equal(shouldRenderHomeFaqJsonLd('root'), true);
});

test('locale homepage suppresses nested FAQPage JSON-LD because locale layout owns it', () => {
  assert.equal(shouldRenderHomeFaqJsonLd('locale'), false);
});

test('unexpected scopes do not opt pages into FAQPage JSON-LD', () => {
  assert.equal(shouldRenderHomeFaqJsonLd('marketing' as never), false);
});

test('JSON-LD serialization escapes script-breaking characters', () => {
  const serialized = serializeJsonLd({
    name: 'PicSpeak </script><script>alert(1)</script>',
    separator: '\u2028\u2029',
  });

  assert.doesNotMatch(serialized, /<\/script/i);
  assert.match(serialized, /\\u003c\/script>/i);
  assert.match(serialized, /\\u2028\\u2029/);
});
