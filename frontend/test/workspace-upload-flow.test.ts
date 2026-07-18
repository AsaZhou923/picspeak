import test from 'node:test';
import assert from 'node:assert/strict';
import { cachePhoto, extractClientMeta, getCachedPhoto } from '../src/features/workspace/hooks/uploadFlowSupport.ts';
import type { PhotoCreateResponse } from '../src/lib/types.ts';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

const sessionStorage = new MemoryStorage();
Object.defineProperty(globalThis, 'window', {
  value: { sessionStorage },
  configurable: true,
});

function makePhoto(id: string): PhotoCreateResponse {
  return {
    photo_id: id,
    photo_url: `https://api.example.com/photos/${id}/image`,
    status: 'READY',
  };
}

test('extractClientMeta preserves upload dimensions and timing metrics', () => {
  const file = new File(['image'], 'sample.jpg', { type: 'image/jpeg', lastModified: 1_700_000_000_000 });

  const meta = extractClientMeta(file, {
    width: 1024,
    height: 768,
    original_size: 4096,
    upload_metrics: {
      exif_extract_ms: 4,
      compression_ms: 12,
      file_read_ms: 3,
      preprocess_total_ms: 19,
      compressed: true,
      original_size_bytes: 4096,
      final_size_bytes: 2048,
    },
  });

  assert.equal(meta.original_filename, 'sample.jpg');
  assert.equal(meta.mime, 'image/jpeg');
  assert.equal(meta.size_bytes, 5);
  assert.equal(meta.width, 1024);
  assert.equal(meta.height, 768);
  assert.equal(meta.original_size, 4096);
  assert.deepEqual(meta.upload_metrics, {
    exif_extract_ms: 4,
    compression_ms: 12,
    file_read_ms: 3,
    preprocess_total_ms: 19,
    compressed: true,
    original_size_bytes: 4096,
    final_size_bytes: 2048,
  });
});

test('photo upload cache keeps the latest 20 checksum entries', () => {
  sessionStorage.clear();

  for (let index = 0; index < 22; index += 1) {
    cachePhoto(`sha-${index}`, makePhoto(`pho_${index}`));
  }

  assert.equal(getCachedPhoto('sha-0'), null);
  assert.equal(getCachedPhoto('sha-1'), null);
  assert.equal(getCachedPhoto('sha-2')?.photo_id, 'pho_2');
  assert.equal(getCachedPhoto('sha-21')?.photo_id, 'pho_21');
});
