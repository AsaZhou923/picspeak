import type { Metadata } from 'next';
import LegalPageContent from '@/components/marketing/LegalPageContent';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, buildPublicWebPageJsonLd, INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const title = 'Terms of Service | 服务条款 | 利用規約';
const description =
  'Terms for using PicSpeak AI photo critique, AI Create, accounts, subscriptions, public sharing, and support.';

export const metadata: Metadata = {
  title,
  description,
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates('/terms'),
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/terms`,
    siteName: siteConfig.name,
    title,
    description,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak terms of service',
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

export default function TermsPage() {
  const pageJsonLd = buildPublicWebPageJsonLd({
    site: siteConfig,
    path: '/terms',
    name: title,
    description,
    dateModified: '2026-05-14',
  });
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Terms of Service', path: '/terms' },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <LegalPageContent kind="terms" />
    </>
  );
}
