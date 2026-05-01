import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'AI Image Generation Task Status',
  description: 'Track a private PicSpeak AI image generation task while the result is being created.',
  alternates: {
    canonical: '/generate',
  },
  robots: NO_INDEX_ROBOTS,
};

export default function GenerationTaskLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
