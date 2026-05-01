import type { MetadataRoute } from 'next';
import { GENERATION_PROMPT_EXAMPLES } from '@/content/generation/prompt-examples';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';
import { getBlogPosts } from '@/lib/blog-data';
import { siteConfig } from '@/lib/site';

const LOCALES = ['zh', 'en', 'ja'] as const;
type Locale = (typeof LOCALES)[number];

const LANGUAGE_CODES: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
};

function absoluteUrl(path: string): string {
  return path === '/' ? siteConfig.url : `${siteConfig.url}${path}`;
}

function localizedAlternates(pathForLocale: (locale: Locale) => string, xDefaultPath: string) {
  return {
    languages: Object.fromEntries([
      ...LOCALES.map((locale) => [LANGUAGE_CODES[locale], absoluteUrl(pathForLocale(locale))]),
      ['x-default', absoluteUrl(xDefaultPath)],
    ]),
  };
}

function singleUrlAlternates(path: string) {
  return {
    languages: {
      'x-default': absoluteUrl(path),
    },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    // Root page (x-default)
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/'),
    },
    // Locale-prefixed home pages — same content, pinned language for SEO
    {
      url: `${siteConfig.url}/zh`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/'),
    },
    {
      url: `${siteConfig.url}/en`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/'),
    },
    {
      url: `${siteConfig.url}/ja`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/'),
    },
    // Public single-URL pages. They are multilingual/mixed-language pages, not locale alternates.
    {
      url: `${siteConfig.url}/affiliate`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: singleUrlAlternates('/affiliate'),
    },
    {
      url: `${siteConfig.url}/gallery`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: singleUrlAlternates('/gallery'),
    },
    {
      url: `${siteConfig.url}/generate`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.85,
      alternates: singleUrlAlternates('/generate'),
    },
    {
      url: `${siteConfig.url}/generate/prompts`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.76,
      alternates: singleUrlAlternates('/generate/prompts'),
    },
    ...GENERATION_PROMPT_EXAMPLES.map((example) => ({
      url: `${siteConfig.url}/generate/prompts/${example.id}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.58,
      alternates: singleUrlAlternates(`/generate/prompts/${example.id}`),
    })),
    {
      url: `${siteConfig.url}/workspace`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.75,
    },
    {
      url: `${siteConfig.url}/blog`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
      alternates: localizedAlternates((locale) => `/${locale}/blog`, '/blog'),
    },
    // Blog index — one entry per locale
    ...LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}/blog`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: localizedAlternates((entryLocale) => `/${entryLocale}/blog`, '/blog'),
    })),
    ...getBlogPosts('en').map((post) => ({
      url: `${siteConfig.url}/blog/${post.slug}`,
      lastModified: new Date(post.updatedAt),
      changeFrequency: 'monthly' as const,
      priority: 0.65,
      alternates: localizedAlternates((locale) => `/${locale}/blog/${post.slug}`, `/blog/${post.slug}`),
    })),
    // Blog posts — one entry per locale × slug
    ...LOCALES.flatMap((locale) =>
      getBlogPosts(locale).map((post) => ({
        url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.65,
        alternates: localizedAlternates((entryLocale) => `/${entryLocale}/blog/${post.slug}`, `/blog/${post.slug}`),
      }))
    ),
    ...LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}/updates`,
      lastModified: new Date('2026-04-11'),
      changeFrequency: 'monthly' as const,
      priority: 0.6,
      alternates: localizedAlternates((entryLocale) => `/${entryLocale}/updates`, '/updates'),
    })),
    {
      url: `${siteConfig.url}/updates`,
      lastModified: new Date('2026-04-11'),
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: localizedAlternates((locale) => `/${locale}/updates`, '/updates'),
    },
    {
      // Canonical public example of an AI photo critique result
      url: `${siteConfig.url}/reviews/${DEMO_REVIEW_ID}`,
      lastModified: new Date('2026-03-08'),
      changeFrequency: 'monthly',
      priority: 0.8,
      alternates: singleUrlAlternates(`/reviews/${DEMO_REVIEW_ID}`),
    },
  ];
}
