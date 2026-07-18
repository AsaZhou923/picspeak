import type { Metadata } from 'next';
import LegalPageContent from '@/components/marketing/LegalPageContent';
import { INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const title = 'Privacy Notice | 隐私说明 | プライバシー通知';
const description =
  'How PicSpeak handles uploaded photos, prompts, generated images, account data, payments, analytics, and support requests.';

export const metadata: Metadata = {
  title,
  description,
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates('/privacy'),
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/privacy`,
    siteName: siteConfig.name,
    title,
    description,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak privacy notice',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

export default function PrivacyPage() {
  return <LegalPageContent kind="privacy" />;
}
