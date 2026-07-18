import type { Metadata } from 'next';
import type { BlogPost, BlogUiCopy } from '@/lib/blog-data';
import type { Locale } from '@/lib/i18n';

export const HOME_LANGUAGE_ALTERNATES: NonNullable<Metadata['alternates']>['languages'] = {
  'zh-CN': '/zh',
  en: '/en',
  ja: '/ja',
  'x-default': '/en',
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

const ARTICLE_LANGUAGE_BY_LOCALE: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
};

export function singlePageAlternates(canonical: string): NonNullable<Metadata['alternates']> {
  return {
    canonical,
    languages: {
      'x-default': canonical,
    },
  };
}

type WebSiteJsonLdInput = {
  site: {
    name: string;
    url: string;
  };
  locale: Locale;
  language: string;
  description: string;
  searchActionName: string;
};

export function buildWebSiteJsonLd({
  site,
  locale,
  language,
  description,
  searchActionName,
}: WebSiteJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: `${site.url}/${locale}`,
    inLanguage: language,
    description,
    potentialAction: [
      {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${site.url}/gallery?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
        name: searchActionName,
      },
      {
        '@type': 'SubscribeAction',
        name: 'Subscribe to PicSpeak Updates',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${site.url}/updates`,
          actionPlatform: [
            'http://schema.org/DesktopWebPlatform',
            'http://schema.org/MobileWebPlatform',
          ],
        },
        object: {
          '@type': 'WebPage',
          name: 'PicSpeak Updates',
          url: `${site.url}/updates`,
          description:
            'PicSpeak product updates covering AI scoring, gallery improvements, blog launches, AI Create releases, and workflow changes.',
        },
      },
    ],
    hasPart: [
      {
        '@type': 'WebPage',
        name: 'PicSpeak Updates',
        url: `${site.url}/updates`,
      },
    ],
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

type BlogPostingJsonLdInput = {
  site: {
    name: string;
    url: string;
    logoImage: string;
    author: {
      id: string;
    };
  };
  locale: Locale;
  ui: Pick<BlogUiCopy, 'name'>;
  post: BlogPost;
};

function countReadableUnits(text: string): number {
  const latinWords = text.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g)?.length ?? 0;
  const cjkCharacters = text.match(/[\u3040-\u30ff\u3400-\u9fff]/g)?.length ?? 0;

  return latinWords + cjkCharacters;
}

export function estimateBlogPostWordCount(post: BlogPost): number {
  const contentBlocks = [
    post.title,
    post.intro,
    post.takeawayTitle,
    ...post.takeawayItems,
    ...post.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
    ]),
  ];

  return contentBlocks.reduce((total, block) => total + countReadableUnits(block), 0);
}

export function buildBlogPostingJsonLd({ site, locale, ui, post }: BlogPostingJsonLdInput) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    abstract: post.excerpt,
    articleBody: post.intro,
    wordCount: estimateBlogPostWordCount(post),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: ARTICLE_LANGUAGE_BY_LOCALE[locale],
    url: `${site.url}/${locale}/blog/${post.slug}`,
    image: `${site.url}/${locale}/blog/${post.slug}/opengraph-image`,
    isAccessibleForFree: true,
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['article header h1', '[data-speakable="blog-intro"]'],
    },
    isPartOf: {
      '@type': 'Blog',
      name: ui.name,
      url: `${site.url}/${locale}/blog`,
    },
    author: {
      '@id': site.author.id,
    },
    publisher: {
      '@type': 'Organization',
      name: site.name,
      url: site.url,
      logo: {
        '@type': 'ImageObject',
        url: `${site.url}${site.logoImage}`,
      },
    },
    mainEntityOfPage: `${site.url}/${locale}/blog/${post.slug}`,
    articleSection: post.category,
    keywords: post.keywords.join(', '),
    about: post.keywords.map((keyword) => ({
      '@type': 'Thing',
      name: keyword,
    })),
  };
}

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

type SinglePageSocialMetadataSite = {
  name: string;
  url: string;
  ogImage: string;
  ogImageWidth: number;
  ogImageHeight: number;
};

export const AFFILIATE_METADATA = {
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
} as const;

export function buildAffiliateMetadata(site: SinglePageSocialMetadataSite): Metadata {
  return {
    title: AFFILIATE_METADATA.title,
    description: AFFILIATE_METADATA.description,
    keywords: [...AFFILIATE_METADATA.keywords],
    robots: INDEXABLE_ROBOTS,
    alternates: singlePageAlternates('/affiliate'),
    openGraph: {
      type: 'website',
      url: `${site.url}/affiliate`,
      siteName: site.name,
      title: AFFILIATE_METADATA.title,
      description: AFFILIATE_METADATA.description,
      images: [
        {
          url: site.ogImage,
          width: site.ogImageWidth,
          height: site.ogImageHeight,
          alt: 'PicSpeak Affiliate Program',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: AFFILIATE_METADATA.title,
      description: AFFILIATE_METADATA.description,
      images: [site.ogImage],
    },
  };
}

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
