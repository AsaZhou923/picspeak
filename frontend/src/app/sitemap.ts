import type { MetadataRoute } from 'next';
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
      url: `${siteConfig.url}/workspace`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      // Canonical public example of an AI photo critique result
      url: `${siteConfig.url}/reviews/rev_35e0951d0df94a1e`,
      lastModified: new Date('2026-03-08'),
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/account/reviews`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${siteConfig.url}/account/usage`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.4,
    },
  ];
}
