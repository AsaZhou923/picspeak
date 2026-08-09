import type { Metadata } from 'next';
import { serializeJsonLd } from '@/lib/json-ld';
import {
  buildPublicBreadcrumbJsonLd,
  buildPublicWebPageJsonLd,
  INDEXABLE_ROBOTS,
  singlePageAlternates,
} from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const RETAKE_PATH = '/retake';
const RETAKE_URL = `${siteConfig.url}${RETAKE_PATH}`;
const title = 'AI Photo Retake Coach and Before-After Comparison';
const description =
  'Turn AI photo critique into a retake target, compare the original and new frame across five photography dimensions, and connect the next action to visible evidence.';

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'AI photo retake coach',
    'before and after photo comparison',
    'photography improvement tracker',
    'photo critique practice',
    'composition comparison',
  ],
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates(RETAKE_PATH),
  openGraph: {
    type: 'website',
    url: RETAKE_URL,
    siteName: siteConfig.name,
    title,
    description,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak Retake Coach before-and-after photography workflow',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

export default function RetakeLayout({ children }: { children: React.ReactNode }) {
  const webpageJsonLd = buildPublicWebPageJsonLd({
    site: siteConfig,
    path: RETAKE_PATH,
    name: title,
    description,
    language: 'en',
    dateModified: '2026-08-09',
  });
  const retakeAppJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${RETAKE_URL}#retake-coach`,
    name: 'PicSpeak Retake Coach',
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web',
    url: RETAKE_URL,
    description,
    isAccessibleForFree: true,
    creator: {
      '@id': siteConfig.author.id,
    },
    publisher: {
      '@id': siteConfig.organizationId,
    },
    featureList: [
      'Carry an original critique into a retake goal',
      'Compare original and retake across composition, lighting, color, impact, and technique',
      'Show score changes with visible evidence and a next action',
      'Keep only comparable retakes in the progress chain',
    ],
  };
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Retake Coach', path: RETAKE_PATH },
    ],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(webpageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(retakeAppJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      {children}
    </>
  );
}
