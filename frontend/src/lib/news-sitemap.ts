import { siteConfig } from './site.ts';
import { getLatestProductUpdate } from './updates-data.ts';

export const NEWS_SITEMAP_PATH = '/sitemap-news.xml';

export type NewsSitemapEntry = {
  loc: string;
  title: string;
  publicationDate: string;
  language: 'en';
};

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildNewsSitemapEntries(): NewsSitemapEntry[] {
  const latestUpdate = getLatestProductUpdate('en');
  return latestUpdate
    ? [
      {
        loc: `${siteConfig.url}/updates`,
        title: latestUpdate.title,
        publicationDate: latestUpdate.date,
        language: 'en' as const,
      },
    ]
    : [];
}

export function buildNewsSitemapXml(entries = buildNewsSitemapEntries()): string {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
    <news:news>
      <news:publication>
        <news:name>PicSpeak Updates</news:name>
        <news:language>${entry.language}</news:language>
      </news:publication>
      <news:publication_date>${escapeXml(entry.publicationDate)}</news:publication_date>
      <news:title>${escapeXml(entry.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;
}
