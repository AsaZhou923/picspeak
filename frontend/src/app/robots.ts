import type { MetadataRoute } from 'next';
import { IMAGE_SITEMAP_PATH } from '../lib/image-sitemap.ts';
import { NEWS_SITEMAP_PATH } from '../lib/news-sitemap.ts';
import { siteConfig } from '../lib/site.ts';

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
  const publicDisallow = [
    '/api/',
    '/trpc/',
    '/account/',
    '/workspace/',
    '/photos/',
    '/generation-tasks/',
    '/generations/',
    '/payment-success/',
  ];

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: publicDisallow,
        crawlDelay: 5,
      },
      ...AI_AND_SEARCH_CRAWLERS.map((userAgent) => ({
        userAgent,
        allow: '/',
        disallow: publicDisallow,
        crawlDelay: 5,
      })),
    ],
    sitemap: [
      `${siteConfig.url}/sitemap.xml`,
      `${siteConfig.url}${IMAGE_SITEMAP_PATH}`,
      `${siteConfig.url}${NEWS_SITEMAP_PATH}`,
    ],
    host: siteConfig.url,
  };
}
