import type { Metadata } from 'next';
import UpdatesPageContent from '@/components/marketing/UpdatesPageContent';
import { buildDefaultUpdatesMetadata } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export function generateMetadata(): Metadata {
  return buildDefaultUpdatesMetadata(siteConfig);
}

export default function UpdatesPage() {
  return <UpdatesPageContent homeHref="/" />;
}
