import type { Metadata } from 'next';

export const HOME_LANGUAGE_ALTERNATES: NonNullable<Metadata['alternates']>['languages'] = {
  'zh-CN': '/zh',
  en: '/en',
  ja: '/ja',
  'x-default': '/',
};

export const OPEN_GRAPH_LOCALES = {
  zh: 'zh_CN',
  en: 'en_US',
  ja: 'ja_JP',
} as const;

export const INDEXABLE_ROBOTS: NonNullable<Metadata['robots']> = {
  index: true,
  follow: true,
  googleBot: {
    index: true,
    follow: true,
    'max-image-preview': 'large',
    'max-snippet': -1,
    'max-video-preview': -1,
  },
};

export const NO_INDEX_ROBOTS: NonNullable<Metadata['robots']> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    'max-image-preview': 'none',
    'max-snippet': 0,
    'max-video-preview': 0,
  },
};

export function singlePageAlternates(canonical: string): NonNullable<Metadata['alternates']> {
  return {
    canonical,
    languages: {
      'zh-CN': canonical,
      en: canonical,
      ja: canonical,
      'x-default': canonical,
    },
  };
}
