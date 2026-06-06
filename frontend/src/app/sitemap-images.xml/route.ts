import { buildImageSitemapXml } from '@/lib/image-sitemap';

export const revalidate = 3600;

export function GET() {
  return new Response(buildImageSitemapXml(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
