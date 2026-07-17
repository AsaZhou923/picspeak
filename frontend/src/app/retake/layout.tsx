import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'GPT-5.6 Terra Retake Coach — Compare Original and Retake',
  description:
    'Choose an original critique, upload a retake, and compare five photographic dimensions with GPT-5.6 Terra.',
  robots: NO_INDEX_ROBOTS,
};

export default function RetakeLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
