import type { Metadata } from 'next';
import { INDEXABLE_ROBOTS } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Upload Photos for AI Critique and Manage Analysis Sessions',
  description:
    'Upload photos, choose critique modes, and manage analysis sessions inside the PicSpeak workspace for AI photo feedback.',
  robots: INDEXABLE_ROBOTS,
};

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
