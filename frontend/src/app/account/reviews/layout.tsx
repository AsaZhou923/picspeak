import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Your AI Photo Critique History and Review Archive',
  description:
    'Browse the full archive of your PicSpeak photo critiques, including scores, feedback history, and saved review results.',
};

export default function AccountReviewsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
