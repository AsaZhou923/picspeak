import type { Metadata } from 'next';
import { singlePageAlternates } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'AI Photo Critique Gallery | AI 摄影点评长廊 | AI 写真講評ギャラリー | PicSpeak',
  description:
    'Browse public AI photo critiques with scores and feedback. 浏览公开的 AI 摄影点评案例。公開された AI 写真講評のギャラリーで、構図、光、色、印象、技術のスコアと改善提案を確認できます。',
  keywords: [
    'AI photo critique gallery',
    'photography examples',
    'photo critique archive',
    'AI 摄影点评长廊',
    '照片点评案例',
    '摄影评分示例',
    'AI 写真講評ギャラリー',
    '写真採点例',
    '写真フィードバック例',
  ],
  alternates: singlePageAlternates('/gallery'),
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
