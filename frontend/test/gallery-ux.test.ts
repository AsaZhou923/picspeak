import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  galleryGridClassName,
  GALLERY_PREFERENCES_STORAGE_KEY,
  readGalleryPreferences,
  sanitizeGalleryPreferences,
  writeGalleryPreferences,
} from '../src/lib/gallery-preferences.ts';
import { buildGalleryApiUrl, buildScoreboardGalleryHref } from '../src/lib/gallery-scoreboard-api.ts';
import { sanitizeGalleryBackHref, sanitizeGalleryNeighborQuery } from '../src/lib/gallery-scoreboard-api.ts';
import type { GalleryScoreboardResponse } from '../src/lib/gallery-ux-types.ts';

test('gallery preferences sanitize invalid stored values', () => {
  assert.deepEqual(sanitizeGalleryPreferences({ columns: '9', density: 'tiny' }), {
    columns: 'auto',
    density: 'full',
  });
  assert.deepEqual(sanitizeGalleryPreferences({ columns: '3', density: 'compact' }), {
    columns: '3',
    density: 'compact',
  });
});

test('gallery preferences read and write through safe localStorage payloads', () => {
  const store = new Map<string, string>();
  globalThis.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  } as unknown as Window & typeof globalThis;

  store.set(GALLERY_PREFERENCES_STORAGE_KEY, '{"columns":"2","density":"compact"}');
  assert.deepEqual(readGalleryPreferences(), { columns: '2', density: 'compact' });

  writeGalleryPreferences({ columns: '1', density: 'full' });
  assert.deepEqual(JSON.parse(store.get(GALLERY_PREFERENCES_STORAGE_KEY) ?? '{}'), {
    columns: '1',
    density: 'full',
  });

  store.set(GALLERY_PREFERENCES_STORAGE_KEY, '{broken');
  assert.deepEqual(readGalleryPreferences(), { columns: 'auto', density: 'full' });
  assert.equal(store.has(GALLERY_PREFERENCES_STORAGE_KEY), false);
  delete (globalThis as { window?: unknown }).window;
});

test('gallery grid class caps explicit layouts at one two or three columns', () => {
  assert.equal(galleryGridClassName('1'), 'grid-cols-1');
  assert.match(galleryGridClassName('2'), /md:grid-cols-2/);
  assert.match(galleryGridClassName('3'), /xl:grid-cols-3/);
  assert.doesNotMatch(galleryGridClassName('auto'), /xl:grid-cols-4/);
});

test('unavailable storage cannot break live gallery layout selection', () => {
  globalThis.window = {
    get localStorage() { throw new Error('Storage blocked'); },
  } as unknown as Window & typeof globalThis;
  try {
    assert.deepEqual(readGalleryPreferences(), { columns: 'auto', density: 'full' });
    assert.doesNotThrow(() => writeGalleryPreferences({ columns: '2', density: 'compact' }));
  } finally {
    delete (globalThis as { window?: unknown }).window;
  }
});

test('loaded gallery cards use the selected grid instead of a fixed responsive layout', () => {
  const source = readFileSync(new URL('../src/app/gallery/GalleryClientPage.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-testid="gallery-grid" className=\{`[^`]*galleryGridClassName\(preferences\.columns\)/);
  assert.match(source, /if \(preferencesLoaded\) writeGalleryPreferences\(preferences\)/);
  assert.doesNotMatch(source, /xl:grid-cols-4/);
});

test('scoreboard view-more link converts half-open UTC end to inclusive gallery date', () => {
  const payload: GalleryScoreboardResponse = {
    items: [],
    window_days: 7,
    as_of: '2026-09-22T00:00:00.000Z',
    window_start: '2026-09-15T00:00:00.000Z',
    window_end: '2026-09-22T00:00:00.000Z',
    ranking_mode: 'popular',
    ranking_rule_version: 'gallery-scoreboard-v1',
    ranking_sort: ['like_count_desc', 'gallery_added_at_desc', 'review_id_desc'],
    eligible_photo_count: 12,
    eligible_author_count: 6,
    cold_start_reasons: [],
    image_type: 'street',
  };

  const href = buildScoreboardGalleryHref(payload);

  assert.match(href, /^\/gallery\?/);
  assert.match(href, /created_from=2026-09-15/);
  assert.match(href, /created_to=2026-09-21/);
  assert.match(href, /image_type=street/);
  assert.match(href, /sort=likes/);
});

test('gallery neighbor query keeps only stable gallery filters', () => {
  const query = sanitizeGalleryNeighborQuery(
    'sort=default&cursor=abc&restore=1&back_href=%2Fgallery%3Fback_href%3Dagain&created_from=2026-09-01&rank_reference_at=2026-09-22T00%3A00%3A00.000Z'
  );

  assert.equal(query.get('sort'), 'default');
  assert.equal(query.get('created_from'), '2026-09-01');
  assert.equal(query.get('rank_reference_at'), '2026-09-22T00:00:00.000Z');
  assert.equal(query.has('cursor'), false);
  assert.equal(query.has('restore'), false);
  assert.equal(query.has('back_href'), false);
});

test('gallery back href is local and non-recursive', () => {
  assert.equal(sanitizeGalleryBackHref('https://evil.example/gallery?restore=1'), '/gallery?restore=1');

  const safe = sanitizeGalleryBackHref('/gallery?sort=latest&cursor=abc&back_href=%2Fgallery%3Fback_href%3Dloop');
  assert.equal(safe, '/gallery?sort=latest&restore=1');
});

test('gallery API URL builder preserves canonical root api base paths', () => {
  const previous = process.env.NEXT_PUBLIC_API_URL;
  try {
    process.env.NEXT_PUBLIC_API_URL = 'https://example.test/root';
    assert.equal(
      buildGalleryApiUrl('/gallery/scoreboard?window_days=7'),
      'https://example.test/root/api/v1/gallery/scoreboard?window_days=7'
    );

    process.env.NEXT_PUBLIC_API_URL = 'https://example.test/root/api';
    assert.equal(
      buildGalleryApiUrl('/gallery/scoreboard?window_days=7'),
      'https://example.test/root/api/v1/gallery/scoreboard?window_days=7'
    );

    process.env.NEXT_PUBLIC_API_URL = 'https://example.test/root/api/v1';
    assert.equal(
      buildGalleryApiUrl('/gallery/scoreboard?window_days=7'),
      'https://example.test/root/api/v1/gallery/scoreboard?window_days=7'
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_API_URL;
    } else {
      process.env.NEXT_PUBLIC_API_URL = previous;
    }
  }
});
