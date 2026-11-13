import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PhotoCritiqueTopicView from '@/components/topics/PhotoCritiqueTopicView';
import {
  PHOTO_CRITIQUE_TOPICS,
  getPhotoCritiqueTopic,
  getPhotoCritiqueTopicPath,
  type PhotoCritiqueTopicLocale,
} from '@/content/topics/photo-critique-topics';
import { getBlogPost } from '@/lib/blog-data';
import { fetchGalleryTopicSamples } from '@/lib/gallery-review-server';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, buildPublicWebPageJsonLd, INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

// Must be a literal for Next.js segment config; keep in sync with GALLERY_REVIEW_REVALIDATE_SECONDS.
export const revalidate = 3600;
export const dynamicParams = false;

type PageProps = { params: Promise<{ topic: string }> };

const LOCALES: PhotoCritiqueTopicLocale[] = ['en', 'zh', 'ja'];

export function generateStaticParams() {
  return PHOTO_CRITIQUE_TOPICS.map((topic) => ({ topic: topic.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { topic: slug } = await params;
  const topic = getPhotoCritiqueTopic(slug);
  if (!topic) return {};
  const copy = topic.copy.en;
  const path = getPhotoCritiqueTopicPath(topic.slug);

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    keywords: topic.keywords,
    robots: INDEXABLE_ROBOTS,
    alternates: singlePageAlternates(path),
    openGraph: {
      type: 'website',
      url: `${siteConfig.url}${path}`,
      siteName: siteConfig.name,
      title: copy.metaTitle,
      description: copy.metaDescription,
      images: [
        {
          url: siteConfig.ogImage,
          width: siteConfig.ogImageWidth,
          height: siteConfig.ogImageHeight,
          alt: copy.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: copy.metaTitle,
      description: copy.metaDescription,
      images: [siteConfig.ogImage],
    },
  };
}

export default async function PhotoCritiqueTopicPage({ params }: PageProps) {
  const { topic: slug } = await params;
  const topic = getPhotoCritiqueTopic(slug);
  if (!topic) notFound();

  const path = getPhotoCritiqueTopicPath(topic.slug);
  const copy = topic.copy.en;
  const samples = await fetchGalleryTopicSamples(topic.imageType);
  const relatedPosts = Object.fromEntries(
    LOCALES.map((locale) => [
      locale,
      topic.relatedBlogSlugs
        .map((postSlug) => getBlogPost(locale, postSlug))
        .filter((post): post is NonNullable<typeof post> => Boolean(post))
        .map((post) => ({ slug: post.slug, title: post.title })),
    ]),
  ) as Record<PhotoCritiqueTopicLocale, Array<{ slug: string; title: string }>>;

  const webPageJsonLd = buildPublicWebPageJsonLd({
    site: siteConfig,
    path,
    name: copy.metaTitle,
    description: copy.metaDescription,
    language: 'en',
    dateModified: topic.lastReviewed,
  });
  const appJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${siteConfig.url}${path}#critique-tool`,
    name: `PicSpeak ${copy.title}`,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: `${siteConfig.url}${path}`,
    description: copy.metaDescription,
    isAccessibleForFree: true,
    publisher: { '@id': siteConfig.organizationId },
    featureList: Object.values(copy.dimensions).map((dimension) => `${dimension.label}: ${dimension.body}`),
  };
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: copy.title, path },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(webPageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(appJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <PhotoCritiqueTopicView topic={topic} samples={samples} relatedPosts={relatedPosts} />
    </>
  );
}
