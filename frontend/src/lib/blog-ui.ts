import blogUiBundles from '../content/blog/ui.json' with { type: 'json' };
import type { Locale } from './i18n.ts';

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
  updatedLabel: string;
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

const BLOG_UI_BUNDLES: Record<Locale, BlogUiCopy> = blogUiBundles;

export const blogConfig = BLOG_UI_BUNDLES.en;

export function getBlogUi(locale: Locale): BlogUiCopy {
  return BLOG_UI_BUNDLES[locale];
}
