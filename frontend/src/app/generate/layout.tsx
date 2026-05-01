import type { Metadata } from 'next';
import { INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const title = 'AI Image Generator and GPT Image 2 Prompt Library';
const description =
  'Create visual references with PicSpeak AI Create: GPT Image 2 prompts for photo inspiration, social visuals, portraits, product scenes, UI concepts, and moodboards.';

const aiCreateJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  '@id': `${siteConfig.url}/generate#ai-create`,
  name: 'PicSpeak AI Create',
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'Web',
  url: `${siteConfig.url}/generate`,
  description,
  image: `${siteConfig.url}${siteConfig.ogImage}`,
  isAccessibleForFree: true,
  creator: {
    '@id': siteConfig.author.id,
  },
  publisher: {
    '@type': 'Organization',
    name: siteConfig.name,
    url: siteConfig.url,
    logo: {
      '@type': 'ImageObject',
      url: `${siteConfig.url}${siteConfig.logoImage}`,
    },
  },
  featureList: [
    'GPT Image 2 visual reference generation',
    'Curated prompt example library',
    'Photo inspiration prompts',
    'Social visual and poster prompts',
    'Portrait avatar, product scene, UI concept, and moodboard prompts',
    'Review-linked reference generation for retake planning',
  ],
  offers: [
    {
      '@type': 'Offer',
      name: 'Free AI image credits',
      price: '0',
      priceCurrency: 'USD',
    },
    {
      '@type': 'Offer',
      name: 'Pro monthly image credits',
      price: '3.99',
      priceCurrency: 'USD',
    },
  ],
};

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    'AI image generator',
    'GPT Image 2 prompts',
    'AI visual reference generator',
    'AI image prompt library',
    'photo inspiration generator',
    'product scene generator',
    'portrait avatar generator',
    'AI moodboard generator',
    'AI图像生成',
    'AI提示词库',
    '摄影参考图生成',
    'AI画像生成',
  ],
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates('/generate'),
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/generate`,
    siteName: siteConfig.name,
    title,
    description,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak AI Create and photo critique workflow',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

export default function GenerateLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(aiCreateJsonLd) }}
      />
      {children}
    </>
  );
}
