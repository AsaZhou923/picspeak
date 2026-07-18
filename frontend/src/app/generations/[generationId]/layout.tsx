import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Private AI Image Generation Result',
  description: 'Open a private PicSpeak AI image generation result, prompt, output settings, and download controls.',
  alternates: {
    canonical: '/generate',
  },
  robots: NO_INDEX_ROBOTS,
};

export default function GenerationDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
