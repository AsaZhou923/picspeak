import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogPostClient from './BlogPostClient';
import { getBlogPost, getBlogSlugs, getBlogUi } from '@/lib/blog-data';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { VALID_LOCALES } from '../../locales';

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export function generateStaticParams() {
  const slugs = getBlogSlugs();
  return VALID_LOCALES.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug }))
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!VALID_LOCALES.includes(locale as Locale)) return {};

  const post = getBlogPost(locale as Locale, slug);
  if (!post) return {};

  const ui = getBlogUi(locale as Locale);

  return {
    title: `${post.title} | ${ui.name}`,
    description: post.description,
    keywords: [...post.keywords],
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: `/${locale}/blog/${post.slug}`,
      languages: {
        'zh-CN': `/zh/blog/${post.slug}`,
        en: `/en/blog/${post.slug}`,
        ja: `/ja/blog/${post.slug}`,
        'x-default': `/blog/${post.slug}`,
      },
    },
    openGraph: {
      type: 'article',
      url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
      title: post.title,
      description: post.description,
      siteName: siteConfig.name,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt,
      tags: post.keywords,
      images: [{ url: siteConfig.ogImage, width: siteConfig.ogImageWidth, height: siteConfig.ogImageHeight, alt: post.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [siteConfig.ogImage],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await params;

  if (!getBlogSlugs().includes(slug)) {
    notFound();
  }

  return <BlogPostClient locale={locale} slug={slug} />;
}
