import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import BlogPostClient from '../../[locale]/blog/[slug]/BlogPostClient';
import { getBlogPost, getBlogSlugs, getBlogUi } from '@/lib/blog-data';
import type { Locale } from '@/lib/i18n';
import { normalizeLocale } from '@/lib/locale';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

type Props = {
  params: Promise<{ slug: string }>;
};

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  return normalizeLocale(requestHeaders.get('x-picspeak-locale'));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getRequestLocale();
  const post = getBlogPost(locale, slug);

  if (!post) {
    return {};
  }

  const ui = getBlogUi(locale);

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
        'x-default': `/en/blog/${post.slug}`,
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
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [`/${locale}/blog/${post.slug}/opengraph-image`],
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getRequestLocale();

  if (!getBlogSlugs().includes(slug)) {
    notFound();
  }

  return <BlogPostClient locale={locale} slug={slug} />;
}
