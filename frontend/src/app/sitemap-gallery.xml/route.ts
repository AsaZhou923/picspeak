import { buildGallerySitemapXml } from '@/lib/gallery-review-page';
import { fetchGallerySitemapEntries } from '@/lib/gallery-review-server';
import { siteConfig } from '@/lib/site';

export const revalidate = 3600;

export async function GET() {
  const entries = await fetchGallerySitemapEntries();
  return new Response(buildGallerySitemapXml(siteConfig.url, entries), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
