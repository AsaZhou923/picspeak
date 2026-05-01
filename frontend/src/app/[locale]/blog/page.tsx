import type { Metadata } from 'next';
import BlogIndexClient from './BlogIndexClient';
import { getBlogUi } from '@/lib/blog-data';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { VALID_LOCALES } from '../locales';

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!VALID_LOCALES.includes(locale as Locale)) return {};

  const ui = getBlogUi(locale as Locale);

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
        'x-default': '/blog',
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

export default async function BlogIndexPage({ params }: Props) {
  const { locale } = await params;

  return <BlogIndexClient locale={locale} />;
}
