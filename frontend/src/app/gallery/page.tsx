import GallerySeoHero from '@/components/gallery/GallerySeoHero';
import GalleryClientPage from './GalleryClientPage';
import { buildGalleryCollectionJsonLd } from '@/lib/gallery-schema';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const galleryCollectionJsonLd = buildGalleryCollectionJsonLd({ site: siteConfig });
const galleryBreadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
  site: siteConfig,
  items: [
    { name: siteConfig.name, path: '/en' },
    { name: 'AI Photo Critique Gallery', path: '/gallery' },
  ],
});

export default function GalleryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(galleryCollectionJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(galleryBreadcrumbJsonLd) }}
      />
      <GallerySeoHero />
      <GalleryClientPage />
    </>
  );
}
