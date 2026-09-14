import { headers } from 'next/headers';
import { HomePageContent } from '@/components/home/HomePageClient';
import { HomeSeoFallback } from '@/components/home/HomeSeoFallback';
import HomeStructuredData from '@/components/home/HomeStructuredData';
import { I18nProvider, type Locale } from '@/lib/i18n';
import { getInitialTranslations } from '@/lib/i18n-initial';
import { isSupportedLocale } from '@/lib/locale';

export default async function HomePage() {
  const requestHeaders = await headers();
  const requestLocale = requestHeaders.get('x-picspeak-locale');
  const locale: Locale = isSupportedLocale(requestLocale) ? requestLocale : 'en';

  return (
    <I18nProvider initialLocale={locale} initialMessages={getInitialTranslations(locale)}>
      <HomeStructuredData locale={locale} />
      <HomeSeoFallback locale={locale} />
      <HomePageContent />
    </I18nProvider>
  );
}
