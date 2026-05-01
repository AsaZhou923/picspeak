import { normalizeLocale, type SupportedLocale } from './locale.ts';

export type GallerySeoHeroCopy = {
  eyebrow: string;
  title: string;
  body: string;
  primaryCta: string;
  secondaryCta: string;
  highlights: Array<{
    title: string;
    body: string;
  }>;
};

const GALLERY_SEO_HERO_COPY: Record<SupportedLocale, GallerySeoHeroCopy> = {
  zh: {
    eyebrow: 'AI 摄影点评案例',
    title: '上传下一张照片前，先浏览真实的 PicSpeak 点评模式',
    body:
      '这个公开长廊为搜索引擎和读者提供服务端可见的点评档案摘要：五维评分、改进语言，以及把 AI 反馈连接到可重复摄影练习的真实案例。',
    primaryCta: '开始点评',
    secondaryCta: '查看提示词案例',
    highlights: [
      {
        title: 'AI 点评评分卡',
        body: '公开案例展示构图、光线、色彩、表现力和技术五个维度的分数，并配有可执行的下一步建议。',
      },
      {
        title: '从长廊进入练习闭环',
        body: '读者可以研究已审核的点评、比较视觉规律，再进入新的上传或 AI 参考图生成流程。',
      },
      {
        title: '摄影学习档案',
        body: '长廊补充了镜头手记内容，沉淀真实点评格式、分数标签、摘要和可复用的复盘语言。',
      },
    ],
  },
  en: {
    eyebrow: 'AI photo critique examples',
    title: 'Browse real PicSpeak critique patterns before you upload your next photo',
    body:
      'This public gallery gives crawlers and readers a server-rendered summary of the critique archive: five-dimension scoring, improvement language, and examples that connect AI feedback with repeatable photography practice.',
    primaryCta: 'Start a critique',
    secondaryCta: 'Explore prompt examples',
    highlights: [
      {
        title: 'AI critique scorecards',
        body: 'Public examples show composition, lighting, color, impact, and technique scores with practical next-step notes.',
      },
      {
        title: 'Gallery-to-practice loop',
        body: 'Readers can study approved critiques, compare visual patterns, and move into a new upload or AI reference generation flow.',
      },
      {
        title: 'Photography learning archive',
        body: 'The gallery complements Lens Notes with real critique formats, score labels, summaries, and repeatable review language.',
      },
    ],
  },
  ja: {
    eyebrow: 'AI 写真講評の事例',
    title: '次の写真をアップロードする前に、PicSpeak の実例パターンを見る',
    body:
      'この公開ギャラリーは、クローラーと読者に向けて、5 項目スコア、改善の言語化、AI フィードバックを反復練習につなげる実例をサーバー側で表示します。',
    primaryCta: '講評を始める',
    secondaryCta: 'プロンプト例を見る',
    highlights: [
      {
        title: 'AI 講評スコアカード',
        body: '公開例では、構図、光、色、印象、技術のスコアと、次に試すべき具体的なメモを確認できます。',
      },
      {
        title: 'ギャラリーから練習へ',
        body: '承認済みの講評を読み、視覚パターンを比較し、新しいアップロードや AI 参考画像生成へ進めます。',
      },
      {
        title: '写真学習アーカイブ',
        body: 'ギャラリーは Lens Notes を補完し、実際の講評形式、スコアラベル、要約、復習しやすい言葉を蓄積します。',
      },
    ],
  },
};

export function getGallerySeoHeroCopy(locale: string | null | undefined): GallerySeoHeroCopy {
  return GALLERY_SEO_HERO_COPY[normalizeLocale(locale)];
}
