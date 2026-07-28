import type { Metadata } from 'next';
import { headers } from 'next/headers';
import BlogIndexPageContent from '../[locale]/blog/BlogIndexPageContent';
import { getBlogUi } from '@/lib/blog-data';
import type { Locale } from '@/lib/i18n';
import { normalizeLocale } from '@/lib/locale';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  return normalizeLocale(requestHeaders.get('x-picspeak-locale'));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const ui = getBlogUi(locale);

  return {
    title: ui.title,
    description: ui.description,
    keywords: [...ui.keywords],
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: `/${locale}/blog`,
      languages: {
        'zh-CN': '/zh/blog',
        en: '/en/blog',
        ja: '/ja/blog',
        'x-default': '/en/blog',
      },
    },
    openGraph: {
      type: 'website',
      url: `${siteConfig.url}/${locale}/blog`,
      title: ui.title,
      description: ui.description,
      siteName: siteConfig.name,
      images: [{ url: siteConfig.ogImage, width: siteConfig.ogImageWidth, height: siteConfig.ogImageHeight, alt: ui.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: ui.title,
      description: ui.description,
      images: [siteConfig.ogImage],
    },
  };
}

export default async function BlogPage() {
  const locale = await getRequestLocale();
  return <BlogIndexPageContent locale={locale} />;
}
