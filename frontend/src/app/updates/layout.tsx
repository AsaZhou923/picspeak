import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PicSpeak Updates | 产品更新 | 更新履歴',
  description:
    'PicSpeak product updates covering AI scoring, gallery improvements, blog launches, and workflow changes across the public product experience.',
  keywords: [
    'PicSpeak updates',
    'AI photo critique changelog',
    'photography app updates',
    'product updates',
  ],
  alternates: {
    canonical: '/updates',
    languages: {
      'zh-CN': '/zh/updates',
      en: '/en/updates',
      ja: '/ja/updates',
      'x-default': '/updates',
    },
  },
};

export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
