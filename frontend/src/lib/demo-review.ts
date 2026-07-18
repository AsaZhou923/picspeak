export const DEMO_IMAGE_FALLBACK_URL =
  'https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/user_108706949454492657694/2026/03/obj_4fea1f667283448c.jpg';

export const DEMO_IMAGE_URL =
  process.env.NEXT_PUBLIC_DEMO_IMAGE_URL?.trim() ||
  DEMO_IMAGE_FALLBACK_URL;

export const DEMO_REVIEW_RATING_VALUE = 7.4;

export const DEMO_REVIEW_IDS = [
  'rev_8424d4fbde054759',
  'rev_35e0951d0df94a1e',
] as const;

export const DEMO_REVIEW_ID = DEMO_REVIEW_IDS[0];

export function isDemoReviewId(reviewId: string): boolean {
  return DEMO_REVIEW_IDS.includes(reviewId as (typeof DEMO_REVIEW_IDS)[number]);
}

type DemoReviewStructuredDataSite = {
  name: string;
  url: string;
  logoImage: string;
};

type DemoReviewStructuredDataInput = {
  site: DemoReviewStructuredDataSite;
  reviewId?: string;
  title: string;
  description: string;
  locale: string;
  imageAlt: string;
  advantage: string;
  critique: string;
  suggestions: string;
};

export function buildDemoReviewJsonLd({
  site,
  reviewId = DEMO_REVIEW_ID,
  title,
  description,
  locale,
  imageAlt,
  advantage,
  critique,
  suggestions,
}: DemoReviewStructuredDataInput) {
  const reviewUrl = `${site.url}/reviews/${reviewId}`;

  return {
    '@context': 'https://schema.org',
    '@type': 'Review',
    '@id': `${reviewUrl}#review`,
    name: title,
    url: reviewUrl,
    inLanguage: locale,
    image: DEMO_IMAGE_URL,
    reviewBody: [advantage, critique, suggestions].join('\n\n'),
    itemReviewed: {
      '@type': 'CreativeWork',
      '@id': `${reviewUrl}#photo-critique`,
      name: title,
      description,
      url: reviewUrl,
      image: {
        '@type': 'ImageObject',
        url: DEMO_IMAGE_URL,
        caption: imageAlt,
      },
    },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: DEMO_REVIEW_RATING_VALUE,
      bestRating: 10,
      worstRating: 0,
    },
    author: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      logo: {
        '@type': 'ImageObject',
        url: `${site.url}${site.logoImage}`,
      },
    },
  };
}
