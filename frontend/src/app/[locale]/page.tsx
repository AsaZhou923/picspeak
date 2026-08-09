import { notFound } from 'next/navigation';
import { I18nProvider, type Locale } from '@/lib/i18n';
import { getInitialTranslations } from '@/lib/i18n-initial';
import { HomePageContent } from '@/components/home/HomePageClient';
import { HomeSeoFallback } from '@/components/home/HomeSeoFallback';
import HomeStructuredData from '@/components/home/HomeStructuredData';
import { VALID_LOCALES } from './locales';


/**
 * /zh, /en, /ja — locale-pinned home pages.
 *
 * We wrap the standard HomePage in its own I18nProvider that bypasses
 * browser-detection and localStorage-restore, pinning the locale derived
 * from the URL segment instead.
 *
 * AppProviders (in the root layout) still wraps the whole tree through its
 * own I18nProvider, but this inner provider takes precedence through React
 * Context's nearest-ancestor rule.
 */
export default async function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!VALID_LOCALES.includes(locale as Locale)) {
    notFound();
  }

  const pinnedLocale = locale as Locale;

  return (
    <I18nProvider initialLocale={pinnedLocale} initialMessages={getInitialTranslations(pinnedLocale)}>
      <HomeStructuredData locale={pinnedLocale} />
      <HomeSeoFallback locale={pinnedLocale} />
      <HomePageContent />
    </I18nProvider>
  );
}
