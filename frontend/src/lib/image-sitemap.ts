import {
  GENERATION_PROMPT_EXAMPLES,
  getLocalizedPromptExampleText,
  getLocalizedPromptExampleTitle,
  normalizePromptExampleExcerpt,
} from '../content/generation/prompt-examples.ts';
import { DEMO_IMAGE_URL, DEMO_REVIEW_ID } from './demo-review.ts';
import { siteConfig } from './site.ts';

export const IMAGE_SITEMAP_PATH = '/sitemap-images.xml';

export type ImageSitemapImage = {
  loc: string;
  title: string;
  caption: string;
};

export type ImageSitemapEntry = {
  loc: string;
  images: ImageSitemapImage[];
};

function absoluteUrl(pathOrUrl: string): string {
  return new URL(pathOrUrl, siteConfig.url).toString();
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function buildImageSitemapEntries(): ImageSitemapEntry[] {
  const promptEntries = GENERATION_PROMPT_EXAMPLES.map((example) => {
    const title = getLocalizedPromptExampleTitle(example, 'en');
    const prompt = getLocalizedPromptExampleText(example.prompt, 'en');

    return {
      loc: absoluteUrl(`/generate/prompts/${example.id}`),
      images: [
        {
          loc: absoluteUrl(example.imagePath),
          title,
          caption: normalizePromptExampleExcerpt(prompt, 180),
        },
      ],
    };
  });

  return [
    {
      loc: absoluteUrl('/gallery'),
      images: [
        {
          loc: absoluteUrl(siteConfig.ogImage),
          title: 'PicSpeak AI Photo Critique Gallery',
          caption:
            'Public PicSpeak gallery page for approved AI photo critique examples, scorecards, and photography practice workflows.',
        },
      ],
    },
    {
      loc: absoluteUrl(`/reviews/${DEMO_REVIEW_ID}`),
      images: [
        {
          loc: absoluteUrl(DEMO_IMAGE_URL),
          title: 'PicSpeak AI Photo Critique Example',
          caption:
            'A public PicSpeak demo review image indexed for AI photo critique, composition feedback, and scorecard discovery.',
        },
      ],
    },
    ...promptEntries,
  ];
}

export function buildImageSitemapXml(entries = buildImageSitemapEntries()): string {
  const urlBlocks = entries
    .map((entry) => {
      const imageBlocks = entry.images
        .map(
          (image) => `    <image:image>
      <image:loc>${escapeXml(image.loc)}</image:loc>
      <image:title>${escapeXml(image.title)}</image:title>
      <image:caption>${escapeXml(image.caption)}</image:caption>
    </image:image>`,
        )
        .join('\n');

      return `  <url>
    <loc>${escapeXml(entry.loc)}</loc>
${imageBlocks}
  </url>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urlBlocks}
</urlset>
`;
}
