import type { MetadataRoute } from 'next';
import { siteConfig } from '@/lib/site';

const AI_AND_SEARCH_CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
      },
      ...AI_AND_SEARCH_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
      })),
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
