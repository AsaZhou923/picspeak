import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS,
  GENERATION_PROMPT_EXAMPLES,
  getGenerationPromptExample,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  normalizePromptExampleExcerpt,
} from '@/content/generation/prompt-examples';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import PromptExampleContent from './PromptExampleContent';

type Props = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return GENERATION_PROMPT_EXAMPLES.map((example) => ({ id: example.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const example = getGenerationPromptExample(id);

  if (!example) {
    return {};
  }

  const title = getLocalizedPromptExampleTitle(example, 'en');
  const prompt = getLocalizedPromptExampleText(example.prompt, 'en');
  const description = normalizePromptExampleExcerpt(prompt, 150);

  return {
    title: `${title} | GPT Image 2 Prompt Example`,
    description,
    keywords: [
      title,
      'GPT Image 2 prompt example',
      'AI image prompt',
      GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS[example.category],
      'PicSpeak AI Create',
    ],
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: `/generate/prompts/${example.id}`,
    },
    openGraph: {
      type: 'article',
      url: `${siteConfig.url}/generate/prompts/${example.id}`,
      siteName: siteConfig.name,
      title,
      description,
      images: [{ url: example.imagePath, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [example.imagePath],
      creator: '@Zzw_Prime',
    },
  };
}

export default async function PromptExamplePage({ params }: Props) {
  const { id } = await params;
  const example = getGenerationPromptExample(id);

  if (!example) {
    notFound();
  }

  const title = getLocalizedPromptExampleTitle(example, 'en');
  const prompt = getLocalizedPromptExampleText(example.prompt, 'en');
  const categoryLabel = GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS[example.category];

  const creativeWorkJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: title,
    url: `${siteConfig.url}/generate/prompts/${example.id}`,
    image: `${siteConfig.url}${example.imagePath}`,
    text: prompt,
    genre: categoryLabel,
    creator: {
      '@type': 'Person',
      name: example.author,
      url: example.sourceUrl,
    },
    isPartOf: {
      '@type': 'CollectionPage',
      name: 'PicSpeak GPT Image 2 Prompt Examples',
      url: `${siteConfig.url}/generate/prompts`,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(creativeWorkJsonLd) }}
      />
      <PromptExampleContent example={example} />
    </>
  );
}
