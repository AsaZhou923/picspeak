import type { Metadata } from 'next';
import { NO_INDEX_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Upload Photos for AI Critique and Manage Analysis Sessions',
  description:
    'Upload photos, choose critique modes, and manage analysis sessions inside the PicSpeak workspace for AI photo feedback.',
  robots: NO_INDEX_ROBOTS,
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
