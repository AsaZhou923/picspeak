import GallerySeoHero from '@/components/gallery/GallerySeoHero';
import GalleryClientPage from './GalleryClientPage';
import { buildGalleryCollectionJsonLd } from '@/lib/gallery-schema';
import { serializeJsonLd } from '@/lib/json-ld';
import { siteConfig } from '@/lib/site';

const galleryCollectionJsonLd = buildGalleryCollectionJsonLd({ site: siteConfig });

export default function GalleryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(galleryCollectionJsonLd) }}
      />
      <GallerySeoHero />
      <GalleryClientPage />
    </>
  );
}
