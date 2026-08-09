import { HomePageContent } from '@/components/home/HomePageClient';
import { HomeSeoFallback } from '@/components/home/HomeSeoFallback';
import HomeStructuredData from '@/components/home/HomeStructuredData';
import { I18nProvider } from '@/lib/i18n';
import { getInitialTranslations } from '@/lib/i18n-initial';

export default function HomePage() {
  return (
    <I18nProvider defaultLocale="en" initialMessages={getInitialTranslations('en')}>
      <HomeStructuredData locale="en" />
      <HomeSeoFallback locale="en" />
      <HomePageContent />
    </I18nProvider>
  );
}
