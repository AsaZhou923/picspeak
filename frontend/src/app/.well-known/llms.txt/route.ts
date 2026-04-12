import { getLlmsText } from '@/lib/llms';

export function GET() {
  return new Response(getLlmsText(), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
