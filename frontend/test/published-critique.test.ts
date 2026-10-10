import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublishedCritique } from '../src/lib/published-critique.ts';

test('featured content uses current public membership without caching or authentication', async (t) => {
  let requestedUrl = '';
  let requestedOptions: RequestInit | undefined;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    requestedUrl = url;
    requestedOptions = options;
    return Response.json({ items: [{ review_id: 'rev_public', photo_thumbnail_url: 'https://images.example/public.webp' }] });
  });
  const published = await getPublishedCritique('rev_public', '2026-05-04');
  assert.equal(published?.review_id, 'rev_public');
  assert.equal(requestedOptions?.cache, 'no-store');
  assert.equal(requestedOptions?.headers, undefined);
  assert.ok(requestedOptions?.signal);
  const url = new URL(requestedUrl);
  assert.equal(url.searchParams.get('created_from'), '2026-05-04T00:00:00Z');
  assert.equal(url.searchParams.get('created_to'), '2026-05-04T23:59:59.999999Z');
});

test('withdrawn, missing-image, failed and unavailable public records are omitted', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch');
  fetchMock.mock.mockImplementation(async () => Response.json({ items: [{ review_id: 'rev_other', photo_thumbnail_url: 'https://images.example/other.webp' }] }));
  assert.equal(await getPublishedCritique('rev_public', '2026-05-04'), null);
  fetchMock.mock.mockImplementation(async () => Response.json({ items: [{ review_id: 'rev_public', photo_thumbnail_url: null }] }));
  assert.equal(await getPublishedCritique('rev_public', '2026-05-04'), null);
  fetchMock.mock.mockImplementation(async () => new Response('', { status: 503 }));
  assert.equal(await getPublishedCritique('rev_public', '2026-05-04'), null);
  fetchMock.mock.mockImplementation(async () => { throw new Error('network unavailable'); });
  assert.equal(await getPublishedCritique('rev_public', '2026-05-04'), null);
});
