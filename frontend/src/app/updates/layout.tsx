import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PicSpeak Updates | 产品更新 | 更新履歴 — PicSpeak',
  description:
    'PicSpeak product updates: AI scoring, gallery, and workflow improvements. 产品更新记录：AI评分优化与工作流修复。アップデート情報：AI採点改善・ギャラリー向上・修正履歴。',
  keywords: [
    'PicSpeak updates',
    'AI photo critique changelog',
    'photography app updates',
    'PicSpeak更新',
    '产品更新',
    'AI摄影点评更新',
    'PicSpeak更新履歴',
    'AI写真批評アップデート',
    '写真アプリ更新',
  ],
  alternates: {
    canonical: '/updates',
    languages: {
      'zh-CN': '/zh',
      en: '/updates',
      ja: '/ja',
      'x-default': '/updates',
    },
  },
};

export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
