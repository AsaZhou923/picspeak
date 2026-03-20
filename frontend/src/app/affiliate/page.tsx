import type { Metadata } from 'next';
import AffiliatePageContent from '@/components/marketing/AffiliatePageContent';

export const metadata: Metadata = {
  title: 'Affiliate Program',
  description:
    'Promote PicSpeak and earn recurring affiliate revenue from photographers and creators.',
  alternates: {
    canonical: '/affiliate',
  },
};

export default function AffiliatePage() {
  return <AffiliatePageContent />;
}
