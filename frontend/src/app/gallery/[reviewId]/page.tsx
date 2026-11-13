import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import PublicGalleryReviewView from '@/components/gallery/PublicGalleryReviewView';
import { getPhotoCritiqueTopicHrefForImageType } from '@/content/topics/photo-critique-topics';
import {
  buildGalleryReviewDescription,
  buildGalleryReviewHeading,
  buildGalleryReviewJsonLd,
  buildGalleryReviewTitle,
  galleryReviewPath,
  getGalleryReviewChromeCopy,
  isIndexableGalleryReview,
  resolveGalleryReviewContentLocale,
} from '@/lib/gallery-review-page';
import { fetchPublicGalleryReview } from '@/lib/gallery-review-server';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS, NO_INDEX_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

// Must be a literal for Next.js segment config; keep in sync with GALLERY_REVIEW_DETAIL_REVALIDATE_SECONDS.
export const revalidate = 60;

type PageProps = { params: Promise<{ reviewId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { reviewId } = await params;
  const review = await fetchPublicGalleryReview(reviewId);
  // Throwing here (not only in the page) lets blocking-metadata requests, such as crawlers, get a real 404 status.
  if (!review) notFound();

  const path = galleryReviewPath(review.review_id);
  const title = buildGalleryReviewTitle(review);
  const description = buildGalleryReviewDescription(review);
  const images = review.photo_thumbnail_url ? [{ url: review.photo_thumbnail_url, alt: buildGalleryReviewHeading(review) }] : [siteConfig.ogImage];

  return {
    title,
    description,
    robots: isIndexableGalleryReview(review) ? INDEXABLE_ROBOTS : NO_INDEX_ROBOTS,
    alternates: singlePageAlternates(path),
    openGraph: {
      type: 'article',
      url: `${siteConfig.url}${path}`,
      siteName: siteConfig.name,
      title,
      description,
      locale: resolveGalleryReviewContentLocale(review),
      publishedTime: review.gallery_added_at,
      modifiedTime: review.updated_at,
      images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: review.photo_thumbnail_url ? [review.photo_thumbnail_url] : [siteConfig.ogImage],
    },
  };
}

export default async function PublicGalleryReviewPage({ params }: PageProps) {
  const { reviewId } = await params;
  const review = await fetchPublicGalleryReview(reviewId);
  if (!review) notFound();

  const path = galleryReviewPath(review.review_id);
  const pageJsonLd = buildGalleryReviewJsonLd({ site: siteConfig, review });
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: getGalleryReviewChromeCopy('en').breadcrumbGallery, path: '/gallery' },
      { name: buildGalleryReviewHeading(review), path },
    ],
  });

  return (
    <>
      <script
        id="picspeak-gallery-review-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageJsonLd) }}
      />
      <script
        id="picspeak-gallery-review-breadcrumb-structured-data"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <PublicGalleryReviewView review={review} topicHref={getPhotoCritiqueTopicHrefForImageType(review.image_type)} />
    </>
  );
}
