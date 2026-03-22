import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'PicSpeak Product Updates, AI Critique Improvements, and Release Notes',
  description:
    'Read PicSpeak product updates covering AI scoring changes, gallery improvements, workflow fixes, and release notes for photographers using the critique platform.',
  alternates: {
    canonical: '/updates',
  },
};

export default function UpdatesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
