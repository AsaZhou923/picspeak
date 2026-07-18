import enBlogBundle from '@/content/blog/en.json';
import jaBlogBundle from '@/content/blog/ja.json';
import zhBlogBundle from '@/content/blog/zh.json';
import type { Locale } from '@/lib/i18n';

export interface BlogPostSection {
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  category: string;
  readingTime: string;
  publishedAt: string;
  updatedAt: string;
  keywords: string[];
  intro: string;
  takeawayTitle: string;
  takeawayItems: string[];
  sections: BlogPostSection[];
}

export interface BlogUiCopy {
  name: string;
  label: string;
  navLabel: string;
  footerLabel: string;
  homeLabel: string;
  homeHint: string;
  title: string;
  description: string;
  keywords: string[];
  introPrimary: string;
  introSecondary: string;
  starterPostsLabel: string;
  primaryTopicsLabel: string;
  seoDirectionLabel: string;
  primaryTopicsText: string;
  seoDirectionText: string;
  startTitle: string;
  startIntro: string;
  featuredLabel: string;
  allPostsLabel: string;
  allPostsHeading: string;
  readFeaturedCta: string;
  readMoreCta: string;
  backToBlog: string;
  nextStepLabel: string;
  nextStepTitle: string;
  nextStepBody: string;
  nextStepCta: string;
  moreArticlesCta: string;
  relatedLabel: string;
  relatedHeading: string;
}

type BlogLocaleBundle = {
  ui: BlogUiCopy;
  posts: BlogPost[];
};

const BLOG_BUNDLES = {
  zh: zhBlogBundle,
  en: enBlogBundle,
  ja: jaBlogBundle,
} satisfies Record<Locale, BlogLocaleBundle>;

const BLOG_SLUGS = BLOG_BUNDLES.en.posts.map((post) => post.slug);

const BLOG_POSTS_BY_LOCALE: Record<Locale, Map<string, BlogPost>> = {
  zh: new Map(BLOG_BUNDLES.zh.posts.map((post) => [post.slug, post])),
  en: new Map(BLOG_BUNDLES.en.posts.map((post) => [post.slug, post])),
  ja: new Map(BLOG_BUNDLES.ja.posts.map((post) => [post.slug, post])),
};

export const blogConfig = BLOG_BUNDLES.en.ui;

export function getBlogUi(locale: Locale): BlogUiCopy {
  return BLOG_BUNDLES[locale].ui;
}

export function getBlogPosts(locale: Locale): BlogPost[] {
  return BLOG_BUNDLES[locale].posts;
}

export function getBlogPost(locale: Locale, slug: string): BlogPost | undefined {
  return BLOG_POSTS_BY_LOCALE[locale].get(slug);
}

export function getBlogSlugs(): string[] {
  return [...BLOG_SLUGS];
}
