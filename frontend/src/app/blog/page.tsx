import type { Metadata } from 'next';
import BlogIndexClient from '../[locale]/blog/BlogIndexClient';
import { blogConfig } from '@/lib/blog-data';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: blogConfig.title,
  description: blogConfig.description,
  keywords: [...blogConfig.keywords],
  robots: INDEXABLE_ROBOTS,
  alternates: {
    canonical: '/blog',
    languages: {
      'zh-CN': '/zh/blog',
      en: '/en/blog',
      ja: '/ja/blog',
      'x-default': '/blog',
    },
  },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/blog`,
    title: blogConfig.title,
    description: blogConfig.description,
    siteName: siteConfig.name,
    images: [{ url: siteConfig.ogImage, alt: blogConfig.title }],
  },
  twitter: {
    card: 'summary',
    title: blogConfig.title,
    description: blogConfig.description,
    images: [siteConfig.ogImage],
  },
};

export default function BlogPage() {
  return <BlogIndexClient />;
}
