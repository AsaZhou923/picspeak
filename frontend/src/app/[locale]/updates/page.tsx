import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import UpdatesPageContent from '@/components/marketing/UpdatesPageContent';
import { I18nProvider, type Locale } from '@/lib/i18n';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, buildUpdatesCollectionJsonLd, UPDATES_LANGUAGE_ALTERNATES } from '@/lib/seo';
import { siteConfig } from '@/lib/site';
import { getProductUpdates } from '@/lib/updates-data';
import { VALID_LOCALES } from '../locales';

type Props = {
  params: Promise<{ locale: string }>;
};

const UPDATES_META: Record<Locale, { title: string; description: string }> = {
  zh: {
    title: 'PicSpeak 更新记录',
    description: '查看 PicSpeak 的产品更新、博客发布、画廊改进与评图工作流优化。',
  },
  en: {
    title: 'PicSpeak Updates',
    description:
      'Browse PicSpeak product updates covering AI critique improvements, blog launches, gallery changes, and workflow fixes.',
  },
  ja: {
    title: 'PicSpeak 更新履歴',
    description:
      'PicSpeak の AI 評価改善、ブログ公開、ギャラリー更新、ワークフロー修正をまとめた更新履歴です。',
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!VALID_LOCALES.includes(locale as Locale)) return {};

  const typedLocale = locale as Locale;
  const meta = UPDATES_META[typedLocale];

  return {
    title: meta.title,
    description: meta.description,
    alternates: {
      canonical: `/${typedLocale}/updates`,
      languages: UPDATES_LANGUAGE_ALTERNATES,
    },
    openGraph: {
      type: 'website',
      url: `${siteConfig.url}/${typedLocale}/updates`,
      siteName: siteConfig.name,
      title: meta.title,
      description: meta.description,
      images: [{ url: siteConfig.ogImage, width: siteConfig.ogImageWidth, height: siteConfig.ogImageHeight, alt: meta.title }],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [siteConfig.ogImage],
    },
  };
}

export default async function LocaleUpdatesPage({ params }: Props) {
  const { locale } = await params;
  if (!VALID_LOCALES.includes(locale as Locale)) {
    notFound();
  }

  const typedLocale = locale as Locale;
  const meta = UPDATES_META[typedLocale];
  const languageByLocale: Record<Locale, string> = { zh: 'zh-CN', en: 'en', ja: 'ja' };
  const homeNameByLocale: Record<Locale, string> = { zh: '首页', en: 'Home', ja: 'ホーム' };
  const updatesNameByLocale: Record<Locale, string> = { zh: '更新记录', en: 'Updates', ja: '更新履歴' };
  const collectionJsonLd = buildUpdatesCollectionJsonLd({
    site: siteConfig,
    path: `/${typedLocale}/updates`,
    name: meta.title,
    description: meta.description,
    language: languageByLocale[typedLocale],
    updates: getProductUpdates(typedLocale),
  });
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: homeNameByLocale[typedLocale], path: `/${typedLocale}` },
      { name: updatesNameByLocale[typedLocale], path: `/${typedLocale}/updates` },
    ],
  });

  return (
    <I18nProvider initialLocale={typedLocale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(collectionJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }} />
      <UpdatesPageContent homeHref={`/${typedLocale}`} />
    </I18nProvider>
  );
}
