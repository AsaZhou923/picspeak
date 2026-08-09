import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  GENERATION_PROMPT_EXAMPLE_CATEGORY_LABELS,
  GENERATION_PROMPT_EXAMPLES,
  buildPromptExampleCreativeWorkJsonLd,
  getGenerationPromptExample,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  normalizePromptExampleExcerpt,
} from '@/content/generation/prompt-examples';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import PromptExampleContent from './PromptExampleContent';

type Props = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return GENERATION_PROMPT_EXAMPLES.map((example) => ({ id: example.id }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const example = getGenerationPromptExample(id);

  if (!example) {
    notFound();
  }

  const title = getLocalizedPromptExampleTitle(example, 'en');
  const prompt = getLocalizedPromptExampleText(example.prompt, 'en');
  const description = normalizePromptExampleExcerpt(prompt, 150);

  return {
    title,
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

  const creativeWorkJsonLd = buildPromptExampleCreativeWorkJsonLd(example, {
    siteUrl: siteConfig.url,
    organizationId: siteConfig.organizationId,
  });
  const promptTitle = getLocalizedPromptExampleTitle(example, 'en');
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Prompt Examples', path: '/generate/prompts' },
      { name: promptTitle, path: `/generate/prompts/${example.id}` },
    ],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(creativeWorkJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
      <PromptExampleContent example={example} />
    </>
  );
}
