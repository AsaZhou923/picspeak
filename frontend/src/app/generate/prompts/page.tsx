import type { Metadata } from 'next';
import {
  GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS,
  GENERATION_PROMPT_EXAMPLES,
  getLocalizedPromptExampleTitle,
} from '@/content/generation/prompt-examples';
import { INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import PromptLibraryContent from './PromptLibraryContent';

export const metadata: Metadata = {
  title: 'GPT Image 2 Prompt Examples and AI Visual Reference Library',
  description:
    'Browse PicSpeak AI Create prompt examples for GPT Image 2: photography references, posters, product scenes, UI concepts, moodboards, and experimental visual prompts.',
  keywords: [
    'GPT Image 2 prompt examples',
    'AI image prompt library',
    'AI visual reference prompts',
    'photography prompt examples',
    'product scene prompts',
    'UI concept prompts',
    'AI poster prompts',
  ],
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates('/generate/prompts'),
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/generate/prompts`,
    siteName: siteConfig.name,
    title: 'GPT Image 2 Prompt Examples | PicSpeak AI Create',
    description:
      'A crawlable library of GPT Image 2 prompt examples for photography, posters, product scenes, UI concepts, and moodboards.',
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak AI Create prompt library',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GPT Image 2 Prompt Examples | PicSpeak',
    description: 'Browse crawlable AI Create prompt examples and visual-reference patterns.',
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

const promptLibraryJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  name: 'PicSpeak GPT Image 2 Prompt Examples',
  url: `${siteConfig.url}/generate/prompts`,
  description:
    'A crawlable prompt example library for PicSpeak AI Create, covering GPT Image 2 photography references, posters, product scenes, UI concepts, and experimental visuals.',
  isPartOf: {
    '@type': 'WebSite',
    name: siteConfig.name,
    url: siteConfig.url,
  },
  hasPart: GENERATION_PROMPT_EXAMPLES.slice(0, 12).map((example) => ({
    '@type': 'CreativeWork',
    name: getLocalizedPromptExampleTitle(example, 'en'),
    url: `${siteConfig.url}/generate/prompts/${example.id}`,
    genre: GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS[example.category],
  })),
};

export default function PromptLibraryPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(promptLibraryJsonLd) }}
      />
      <PromptLibraryContent />
    </>
  );
}
