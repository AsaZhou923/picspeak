import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'AI Photo Analysis Task Progress and Processing Status',
  description:
    'Track the processing status of your PicSpeak AI photo analysis task while the critique result is being generated.',
  robots: NO_INDEX_ROBOTS,
};

export default function TaskDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
