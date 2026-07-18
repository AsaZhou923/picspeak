import { buildNewsSitemapXml } from '@/lib/news-sitemap';

export const dynamic = 'force-static';

export function GET() {
  return new Response(buildNewsSitemapXml(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
