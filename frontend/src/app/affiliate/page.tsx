import type { Metadata } from 'next';
import AffiliatePageContent from '@/components/marketing/AffiliatePageContent';
import { singlePageAlternates } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'PicSpeak Affiliate Program | 推广联盟计划 | アフィリエイト — PicSpeak',
  description:
    'Promote PicSpeak AI photo critique and earn recurring commissions. 推广 PicSpeak AI 摄影点评工具，赚取持续佣金。PicSpeakアフィリエイト — AI写真批評ツールを紹介して継続報酬を獲得。',
  keywords: [
    'PicSpeak affiliate',
    'photography affiliate program',
    'AI photo critique affiliate',
    'PicSpeak推广联盟',
    '摄影推广',
    'AI工具推广',
    '联盟营销',
    'PicSpeakアフィリエイト',
    '写真アフィリエイト',
    'AIツール紹介',
  ],
  alternates: singlePageAlternates('/affiliate'),
};

export default function AffiliatePage() {
  return <AffiliatePageContent />;
}
