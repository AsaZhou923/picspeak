import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Public AI Photo Critique Gallery and Example Review Archive',
  description:
    'Browse public PicSpeak photo critiques with scores, summaries, and actionable feedback to study composition, lighting, color, storytelling, and editing decisions.',
  alternates: {
    canonical: '/gallery',
  },
};

export default function GalleryLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
