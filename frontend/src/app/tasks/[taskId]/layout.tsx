import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Analysis Task',
  description: 'Track the progress of your AI photo analysis task.',
};

export default function TaskDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
