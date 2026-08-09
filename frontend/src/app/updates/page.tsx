import type { Metadata } from 'next';
import UpdatesPageContent from '@/components/marketing/UpdatesPageContent';
import { serializeJsonLd } from '@/lib/json-ld';
import {
  buildDefaultUpdatesMetadata,
  buildPublicBreadcrumbJsonLd,
  buildUpdatesCollectionJsonLd,
  DEFAULT_UPDATES_METADATA,
} from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import { getProductUpdates } from '@/lib/updates-data';

export function generateMetadata(): Metadata {
  return buildDefaultUpdatesMetadata(siteConfig);
}

export default function UpdatesPage() {
  const updates = getProductUpdates('en');
  const collectionJsonLd = buildUpdatesCollectionJsonLd({
    site: siteConfig,
    path: '/updates',
    name: DEFAULT_UPDATES_METADATA.title,
    description: DEFAULT_UPDATES_METADATA.description,
    language: 'en',
    updates,
  });
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Updates', path: '/updates' },
    ],
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <UpdatesPageContent homeHref="/" />
    </>
  );
}
