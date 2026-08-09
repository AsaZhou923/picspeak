import type { MetadataRoute } from 'next';
import { GENERATION_PROMPT_EXAMPLES } from '@/content/generation/prompt-examples';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';
import { getBlogPosts } from '@/lib/blog-data';
import { siteConfig } from '@/lib/site';
import { getLatestProductUpdateDate } from '@/lib/updates-data';

const LOCALES = ['zh', 'en', 'ja'] as const;
type Locale = (typeof LOCALES)[number];
const SEO_CONTENT_LAST_MODIFIED = new Date('2026-08-09');

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

function latestBlogPostUpdatedDate(locale: Locale): Date | undefined {
  return getBlogPosts(locale).reduce<Date | undefined>((latestDate, post) => {
    const updatedAt = new Date(post.updatedAt);
    return !latestDate || updatedAt > latestDate ? updatedAt : latestDate;
  }, undefined);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const latestProductUpdateDate = new Date(getLatestProductUpdateDate());

  return [
    // Locale-prefixed home pages — same content, pinned language for SEO
    {
      url: `${siteConfig.url}/zh`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/en'),
    },
    {
      url: `${siteConfig.url}/en`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/en'),
    },
    {
      url: `${siteConfig.url}/ja`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1,
      alternates: localizedAlternates((locale) => `/${locale}`, '/en'),
    },
    // Public single-URL pages. They are multilingual/mixed-language pages, not locale alternates.
    {
      url: `${siteConfig.url}/affiliate`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8,
      alternates: singleUrlAlternates('/affiliate'),
    },
    {
      url: `${siteConfig.url}/privacy`,
      lastModified: new Date('2026-05-14'),
      changeFrequency: 'yearly',
      priority: 0.45,
      alternates: singleUrlAlternates('/privacy'),
    },
    {
      url: `${siteConfig.url}/terms`,
      lastModified: new Date('2026-05-14'),
      changeFrequency: 'yearly',
      priority: 0.45,
      alternates: singleUrlAlternates('/terms'),
    },
    {
      url: `${siteConfig.url}/gallery`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'daily',
      priority: 0.8,
      alternates: singleUrlAlternates('/gallery'),
    },
    {
      url: `${siteConfig.url}/author/asa-zhou`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.62,
      alternates: singleUrlAlternates('/author/asa-zhou'),
    },
    {
      url: `${siteConfig.url}/editorial-policy`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.55,
      alternates: singleUrlAlternates('/editorial-policy'),
    },
    {
      url: `${siteConfig.url}/generate`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.85,
      alternates: singleUrlAlternates('/generate'),
    },
    {
      url: `${siteConfig.url}/generate/prompts`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.76,
      alternates: singleUrlAlternates('/generate/prompts'),
    },
    ...GENERATION_PROMPT_EXAMPLES.map((example) => ({
      url: `${siteConfig.url}/generate/prompts/${example.id}`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'monthly' as const,
      priority: 0.58,
      alternates: singleUrlAlternates(`/generate/prompts/${example.id}`),
    })),
    // Blog index — one entry per locale
    ...LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}/blog`,
      lastModified: latestBlogPostUpdatedDate(locale),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
      alternates: localizedAlternates((entryLocale) => `/${entryLocale}/blog`, '/en/blog'),
    })),
    // Blog posts — one entry per locale × slug
    ...LOCALES.flatMap((locale) =>
      getBlogPosts(locale).map((post) => ({
        url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
        lastModified: new Date(post.updatedAt),
        changeFrequency: 'monthly' as const,
        priority: 0.65,
        alternates: localizedAlternates(
          (entryLocale) => `/${entryLocale}/blog/${post.slug}`,
          `/en/blog/${post.slug}`,
        ),
      }))
    ),
    ...LOCALES.map((locale) => ({
      url: `${siteConfig.url}/${locale}/updates`,
      lastModified: latestProductUpdateDate,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
      alternates: localizedAlternates((entryLocale) => `/${entryLocale}/updates`, '/updates'),
    })),
    {
      url: `${siteConfig.url}/updates`,
      lastModified: latestProductUpdateDate,
      changeFrequency: 'monthly',
      priority: 0.6,
      alternates: localizedAlternates((locale) => `/${locale}/updates`, '/updates'),
    },
    {
      url: `${siteConfig.url}/retake`,
      lastModified: SEO_CONTENT_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.78,
      alternates: singleUrlAlternates('/retake'),
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
