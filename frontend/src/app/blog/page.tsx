import type { Metadata } from 'next';
import BlogIndexPageContent from '../[locale]/blog/BlogIndexPageContent';
import { blogConfig } from '@/lib/blog-data';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: blogConfig.title,
  description: blogConfig.description,
  keywords: [...blogConfig.keywords],
  robots: INDEXABLE_ROBOTS,
  alternates: {
    canonical: '/en/blog',
    languages: {
      'zh-CN': '/zh/blog',
      en: '/en/blog',
      ja: '/ja/blog',
      'x-default': '/en/blog',
    },
  },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/en/blog`,
    title: blogConfig.title,
    description: blogConfig.description,
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImage, width: siteConfig.ogImageWidth, height: siteConfig.ogImageHeight, alt: blogConfig.title }],
  },
  twitter: {
    card: 'summary_large_image',
    title: blogConfig.title,
    description: blogConfig.description,
    images: [siteConfig.ogImage],
  },
};

export default function BlogPage() {
  return <BlogIndexPageContent />;
}
