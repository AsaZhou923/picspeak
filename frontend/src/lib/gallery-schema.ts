import { DEMO_REVIEW_ID } from './demo-review.ts';

type GallerySchemaSite = {
  name: string;
  url: string;
  ogImage: string;
};

export function buildGalleryCollectionJsonLd({ site }: { site: GallerySchemaSite }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'PicSpeak AI Photo Critique Gallery',
    url: `${site.url}/gallery`,
    description:
      'A public gallery of approved PicSpeak AI photo critique examples with scorecards, improvement summaries, and links into photography practice workflows.',
    isPartOf: {
      '@type': 'WebSite',
      name: site.name,
      url: site.url,
    },
    about: [
      { '@type': 'Thing', name: 'AI photo critique examples' },
      { '@type': 'Thing', name: 'photography feedback' },
      { '@type': 'Thing', name: 'composition scoring' },
      { '@type': 'Thing', name: 'photo review gallery' },
    ],
    hasPart: [
      {
        '@type': 'CreativeWork',
        name: 'Public AI photo critique examples',
        url: `${site.url}/gallery`,
        image: `${site.url}${site.ogImage}`,
        about: 'Browse approved PicSpeak critique cards with scores, strengths, weaknesses, and retake guidance.',
      },
      {
        '@type': 'CreativeWork',
        additionalType: 'https://schema.org/Review',
        name: 'Demo AI photo critique result',
        url: `${site.url}/reviews/${DEMO_REVIEW_ID}`,
        about: 'Example PicSpeak scorecard and written critique for a public demo photo.',
      },
      {
        '@type': 'CreativeWork',
        name: 'Prompt practice from gallery examples',
        url: `${site.url}/generate/prompts`,
        about: 'Use gallery critique patterns as practice prompts and visual-reference generation ideas.',
      },
    ],
  };
}
