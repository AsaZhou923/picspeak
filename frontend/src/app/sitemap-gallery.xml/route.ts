import { buildGallerySitemapXml } from '@/lib/gallery-review-page';
import { fetchGallerySitemapEntries } from '@/lib/gallery-review-server';
import { siteConfig } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const entries = await fetchGallerySitemapEntries();
    const xml = buildGallerySitemapXml(siteConfig.url, entries);
    if (new TextEncoder().encode(xml).byteLength > 50 * 1024 * 1024) {
      throw new Error('Gallery sitemap exceeds the single-sitemap size limit');
    }
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Gallery sitemap is temporarily unavailable.', {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
