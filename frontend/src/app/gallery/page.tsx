import GallerySeoHero from '@/components/gallery/GallerySeoHero';
import GalleryClientPage from './GalleryClientPage';
import { siteConfig } from '@/lib/site';

const galleryCollectionJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'PicSpeak AI Photo Critique Gallery',
  url: `${siteConfig.url}/gallery`,
  description:
    'A public gallery of approved PicSpeak AI photo critique examples with scorecards, improvement summaries, and links into photography practice workflows.',
  isPartOf: {
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
  },
  about: [
    { '@type': 'Thing', name: 'AI photo critique examples' },
    { '@type': 'Thing', name: 'photography feedback' },
    { '@type': 'Thing', name: 'composition scoring' },
    { '@type': 'Thing', name: 'photo review gallery' },
  ],
};

export default function GalleryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(galleryCollectionJsonLd) }}
      />
      <GallerySeoHero />
      <GalleryClientPage />
    </>
  );
}
