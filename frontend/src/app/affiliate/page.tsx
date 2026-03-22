import type { Metadata } from 'next';
import AffiliatePageContent from '@/components/marketing/AffiliatePageContent';

export const metadata: Metadata = {
  title: 'PicSpeak Affiliate Program for Photography Creators and Educators',
  description:
    'Promote PicSpeak to photographers, creators, and educators, and earn recurring affiliate commissions from AI photo critique subscriptions.',
  alternates: {
    canonical: '/affiliate',
  },
};

export default function AffiliatePage() {
  return <AffiliatePageContent />;
}
