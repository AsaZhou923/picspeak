import type { Metadata } from 'next';
import AffiliatePageContent from '@/components/marketing/AffiliatePageContent';
import { buildAffiliateMetadata } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = buildAffiliateMetadata(siteConfig);

export default function AffiliatePage() {
  return <AffiliatePageContent />;
}
