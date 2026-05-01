import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogPostClient from '../../[locale]/blog/[slug]/BlogPostClient';
import { getBlogPost, getBlogSlugs, blogConfig } from '@/lib/blog-data';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost('en', slug);

  if (!post) {
    return {};
  }

  return {
    title: `${post.title} | ${blogConfig.name}`,
    description: post.description,
    keywords: [...post.keywords],
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: `/blog/${post.slug}`,
      languages: {
        'zh-CN': `/zh/blog/${post.slug}`,
        en: `/en/blog/${post.slug}`,
        ja: `/ja/blog/${post.slug}`,
        'x-default': `/blog/${post.slug}`,
      },
    },
    openGraph: {
      type: 'article',
      url: `${siteConfig.url}/blog/${post.slug}`,
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
  const { slug } = await params;

  if (!getBlogSlugs().includes(slug)) {
    notFound();
  }

  return <BlogPostClient slug={slug} />;
}
