import { normalizeLocale, type SupportedLocale } from './locale.ts';

export type GallerySeoHeroCopy = {
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: string;
  exampleCta: string;
};

const GALLERY_SEO_HERO_COPY: Record<SupportedLocale, GallerySeoHeroCopy> = {
  zh: {
    eyebrow: 'AI 摄影点评案例',
    title: '公开作品的 AI 点评与拍摄建议',
    body:
      '看看公开作品的评分、画面依据和改进建议，找到与你的题材相近的例子，再点评自己的照片。',
    primaryCta: '开始点评',
    exampleCta: '查看完整点评示例',
  },
  en: {
    eyebrow: 'AI photo critique examples',
    title: 'Public photo critiques and next-shoot ideas',
    body:
      'Explore the scores, visible evidence, and practical suggestions behind published works. Find a comparable scene, then critique your own photo.',
    primaryCta: 'Start a critique',
    exampleCta: 'View a full critique example',
  },
  ja: {
    eyebrow: 'AI 写真講評の事例',
    title: '公開作品の AI 講評と次の撮影アイデア',
    body:
      '公開作品のスコア、写真上の根拠、改善案を見比べましょう。近い題材を探したら、自分の写真も講評できます。',
    primaryCta: '講評を始める',
    exampleCta: '講評の完全な例を見る',
  },
};

export function getGallerySeoHeroCopy(locale: string | null | undefined): GallerySeoHeroCopy {
  return GALLERY_SEO_HERO_COPY[normalizeLocale(locale)];
}
