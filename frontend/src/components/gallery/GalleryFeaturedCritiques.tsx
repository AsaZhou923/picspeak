import { FEATURED_CRITIQUES } from '@/lib/featured-critiques';
import { getPublishedCritique } from '@/lib/published-critique';
import GalleryFeaturedCritiquesContent from './GalleryFeaturedCritiquesContent';
import { connection } from 'next/server';

export default async function GalleryFeaturedCritiques() {
  await connection();
  const results = await Promise.all(FEATURED_CRITIQUES.map(async (example) => {
    const published = await getPublishedCritique(example.reviewId, example.publishedDate);
    return published ? { ...example, image: published.photo_thumbnail_url! } : null;
  }));
  const examples = results.filter((entry) => entry !== null);
  return examples.length ? <GalleryFeaturedCritiquesContent examples={examples} /> : null;
}
