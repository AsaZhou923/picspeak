import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your Photo Critique Usage, Quota, and Pro Plan Status',
  description:
    'Check your PicSpeak daily usage, remaining critique quota, and current subscription status for photo analysis.',
};

export default function AccountUsageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
