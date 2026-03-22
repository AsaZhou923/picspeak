import type { MetadataRoute } from 'next';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';
import { siteConfig } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteConfig.url}/affiliate`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/gallery`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/updates`,
      lastModified: new Date('2026-03-21'),
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      // Canonical public example of an AI photo critique result
      url: `${siteConfig.url}/reviews/${DEMO_REVIEW_ID}`,
      lastModified: new Date('2026-03-08'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];
}
