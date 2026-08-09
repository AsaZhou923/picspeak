import type { Metadata } from 'next';
import AffiliatePageContent from '@/components/marketing/AffiliatePageContent';
import { serializeJsonLd } from '@/lib/json-ld';
import { AFFILIATE_METADATA, buildAffiliateMetadata, buildPublicBreadcrumbJsonLd, buildPublicWebPageJsonLd } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = buildAffiliateMetadata(siteConfig);

export default function AffiliatePage() {
  const pageJsonLd = buildPublicWebPageJsonLd({
    site: siteConfig,
    path: '/affiliate',
    name: AFFILIATE_METADATA.title,
    description: AFFILIATE_METADATA.description,
  });
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Affiliate Program', path: '/affiliate' },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(pageJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <AffiliatePageContent />
    </>
  );
}
