import { getIndexNowKey } from '@/lib/indexnow';

export function GET() {
  const key = getIndexNowKey();

  if (!key) {
    return new Response('IndexNow key is not configured.\n', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }

  return new Response(`${key}\n`, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
