import type { MetadataRoute } from 'next';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';
import { getBlogPosts } from '@/lib/blog-data';
import { siteConfig } from '@/lib/site';

const LOCALES = ['zh', 'en', 'ja'] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const blogPosts = getBlogPosts('en');

  return [
    // Root page (x-default)
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          en: `${siteConfig.url}/en`,
          ja: `${siteConfig.url}/ja`,
        },
      },
    },
    // Locale-prefixed home pages — same content, pinned language for SEO
    {
      url: `${siteConfig.url}/zh`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          en: `${siteConfig.url}/en`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
    {
      url: `${siteConfig.url}/en`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
    {
      url: `${siteConfig.url}/ja`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          en: `${siteConfig.url}/en`,
          'x-default': siteConfig.url,
        },
      },
    },
    // Public sub-pages — link back to locale homes as alternates
    {
      url: `${siteConfig.url}/affiliate`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
    {
      url: `${siteConfig.url}/gallery`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
    // Blog index — one entry per locale
    ...LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}/blog`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: {
        languages: Object.fromEntries([
          ...LOCALES.filter((l) => l !== locale).map((l) => [l, `${siteConfig.url}/${l}/blog`]),
          ['x-default', `${siteConfig.url}/en/blog`],
        ]),
      },
    })),
    // Blog posts — one entry per locale × slug
    ...LOCALES.flatMap((locale) =>
      blogPosts.map((post) => ({
        url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.65,
        alternates: {
          languages: Object.fromEntries([
            ...LOCALES.filter((l) => l !== locale).map((l) => [l, `${siteConfig.url}/${l}/blog/${post.slug}`]),
            ['x-default', `${siteConfig.url}/en/blog/${post.slug}`],
          ]),
        },
      }))
    ),
    {
      url: `${siteConfig.url}/updates`,
      lastModified: new Date('2026-03-21'),
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
    {
      // Canonical public example of an AI photo critique result
      url: `${siteConfig.url}/reviews/${DEMO_REVIEW_ID}`,
      lastModified: new Date('2026-03-08'),
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: {
        languages: {
          zh: `${siteConfig.url}/zh`,
          ja: `${siteConfig.url}/ja`,
          'x-default': siteConfig.url,
        },
      },
    },
  ];
}
