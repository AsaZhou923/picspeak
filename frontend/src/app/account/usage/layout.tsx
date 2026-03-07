import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Usage',
  description: 'View your daily photo critique usage and quota.',
};

export default function AccountUsageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
