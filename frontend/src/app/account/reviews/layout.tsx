import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Reviews',
  description: 'Browse all AI critique reviews for your uploaded photos.',
};

export default function AccountReviewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
