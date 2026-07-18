import test from 'node:test';
import assert from 'node:assert/strict';
import { parseContentDispositionFilename } from '../src/lib/generation-download.ts';

test('generation download filename parser prefers RFC 5987 encoded filenames', () => {
  assert.equal(
    parseContentDispositionFilename('attachment; filename="fallback.png"; filename*=UTF-8\'\'golden%20hour%20%E6%B5%8B%E8%AF%95.png'),
    'golden hour 测试.png'
  );
});

test('generation download filename parser preserves semicolons inside quoted filenames', () => {
  assert.equal(
    parseContentDispositionFilename('attachment; filename="portrait; final.png"'),
    'portrait; final.png'
  );
});

test('generation download filename parser strips path separators and control characters', () => {
  assert.equal(
    parseContentDispositionFilename('attachment; filename="../unsafe/\u0007image.png"'),
    '..-unsafe-image.png'
  );
});
