import type { Metadata } from 'next';

export const HOME_LANGUAGE_ALTERNATES: NonNullable<Metadata['alternates']>['languages'] = {
  'zh-CN': '/zh',
  en: '/en',
  ja: '/ja',
  'x-default': '/',
};

export const UPDATES_LANGUAGE_ALTERNATES: NonNullable<Metadata['alternates']>['languages'] = {
  'zh-CN': '/zh/updates',
  en: '/en/updates',
  ja: '/ja/updates',
  'x-default': '/updates',
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

type BlogBreadcrumbJsonLdInput = {
  siteName: string;
  siteUrl: string;
  locale: 'zh' | 'en' | 'ja';
  blogName: string;
  postTitle: string;
  slug: string;
};

export function buildBlogBreadcrumbJsonLd({
  siteName,
  siteUrl,
  locale,
  blogName,
  postTitle,
  slug,
}: BlogBreadcrumbJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: siteName,
        item: `${siteUrl}/${locale}`,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: blogName,
        item: `${siteUrl}/${locale}/blog`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: postTitle,
        item: `${siteUrl}/${locale}/blog/${slug}`,
      },
    ],
  };
}

type UpdatesMetadataSite = {
  name: string;
  url: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
};

export const DEFAULT_UPDATES_METADATA = {
  title: 'PicSpeak Updates | 产品更新 | 更新履歴',
  description:
    'PicSpeak product updates covering AI scoring, gallery improvements, blog launches, and workflow changes across the public product experience.',
  keywords: [
    'PicSpeak updates',
    'AI photo critique changelog',
    'photography app updates',
    'product updates',
  ],
} as const;

export function buildDefaultUpdatesMetadata(site: UpdatesMetadataSite): Metadata {
  return {
    title: DEFAULT_UPDATES_METADATA.title,
    description: DEFAULT_UPDATES_METADATA.description,
    keywords: [...DEFAULT_UPDATES_METADATA.keywords],
    robots: INDEXABLE_ROBOTS,
    alternates: {
      canonical: '/updates',
      languages: UPDATES_LANGUAGE_ALTERNATES,
    },
    openGraph: {
      type: 'website',
      url: `${site.url}/updates`,
      siteName: site.name,
      title: DEFAULT_UPDATES_METADATA.title,
      description: DEFAULT_UPDATES_METADATA.description,
      images: [
        {
          url: site.ogImage,
          width: site.ogImageWidth,
          height: site.ogImageHeight,
          alt: DEFAULT_UPDATES_METADATA.title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: DEFAULT_UPDATES_METADATA.title,
      description: DEFAULT_UPDATES_METADATA.description,
      images: [site.ogImage],
    },
  };
}
