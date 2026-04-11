import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AI Photo Critique Gallery | AI摄影点评影像长廊 | AI写真批評ギャラリー — PicSpeak',
  description:
    'Browse public AI photo critiques with scores and feedback. 浏览公开的 AI 摄影点评作品。公開されたAI写真批評のギャラリー — 構図・光・色彩の採点と改善提案を見る。',
  keywords: [
    'AI photo critique gallery',
    'photography examples',
    'photo critique archive',
    'AI摄影点评长廊',
    '影像长廊',
    '照片点评作品',
    '摄影评分示例',
    'AI写真批評ギャラリー',
    '写真採点例',
    '写真フィードバック例',
  ],
  alternates: {
    canonical: '/gallery',
    languages: {
      'zh-CN': '/zh',
      en: '/gallery',
      ja: '/ja',
      'x-default': '/gallery',
    },
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
