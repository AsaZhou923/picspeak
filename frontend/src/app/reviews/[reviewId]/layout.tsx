import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Photo Review',
  description: 'Detailed AI critique and scoring for your photo.',
};

export default function ReviewDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
