import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Shared AI Photo Critique Result and Score Overview',
  description:
    'Open a shared PicSpeak critique result to review the photo score, strengths, weaknesses, and practical AI-generated suggestions in one page.',
  robots: NO_INDEX_ROBOTS,
};

export default function ShareTokenLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
