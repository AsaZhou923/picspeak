import {
  buildHomeAuthorJsonLd,
  buildHomeBreadcrumbJsonLd,
  buildHomeFaqJsonLd,
  buildHomeOrganizationJsonLd,
  buildHomeSoftwareJsonLd,
  buildHomeSourceCodeJsonLd,
} from '@/lib/home-structured-data';
import { getInitialTranslations } from '@/lib/i18n-initial';
import type { Locale } from '@/lib/i18n';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildWebSiteJsonLd } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const FAQ_KEYS = [
  ['faq_q1', 'faq_a1'],
  ['faq_q2', 'faq_a2'],
  ['faq_q3', 'faq_a3'],
  ['faq_q4', 'faq_a4'],
  ['faq_q5', 'faq_a5'],
  ['faq_q6', 'faq_a6'],
  ['faq_q7', 'faq_a7'],
  ['faq_q8', 'faq_a8'],
  ['faq_q9', 'faq_a9'],
  ['faq_q10', 'faq_a10'],
] as const;

const LANGUAGE_BY_LOCALE: Record<Locale, string> = {
  zh: 'zh-CN',
  en: 'en',
  ja: 'ja',
};

const SEARCH_ACTION_BY_LOCALE: Record<Locale, string> = {
  zh: '搜索照片点评',
  en: 'Search photo critiques',
  ja: '写真講評を検索',
};

const HOME_NAME_BY_LOCALE: Record<Locale, string> = {
  zh: '首页',
  en: 'Home',
  ja: 'ホーム',
};

type HomeStructuredDataProps = {
  locale: Locale;
};

export default function HomeStructuredData({ locale }: HomeStructuredDataProps) {
  const messages = getInitialTranslations(locale);
  const language = LANGUAGE_BY_LOCALE[locale];
  const pageUrl = `${siteConfig.url}/${locale}`;
  const faqItems = FAQ_KEYS.map(([questionKey, answerKey]) => ({
    question: messages[questionKey],
    answer: messages[answerKey],
  }));
  const schemas = [
    buildHomeOrganizationJsonLd(siteConfig),
    buildHomeSoftwareJsonLd(siteConfig, {
      pageUrl,
      language,
      description: messages.hero_desc,
    }),
    buildWebSiteJsonLd({
      site: siteConfig,
      locale,
      language,
      description: messages.hero_desc,
      searchActionName: SEARCH_ACTION_BY_LOCALE[locale],
    }),
    buildHomeAuthorJsonLd(siteConfig),
    buildHomeSourceCodeJsonLd(siteConfig),
    buildHomeFaqJsonLd(faqItems, pageUrl),
    buildHomeBreadcrumbJsonLd(siteConfig, pageUrl, HOME_NAME_BY_LOCALE[locale]),
  ];

  return schemas.map((schema, index) => (
    <script
      key={`${locale}-${schema['@type']}-${index}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(schema) }}
    />
  ));
}
