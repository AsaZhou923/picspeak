import { HomePageContent } from '@/components/home/HomePageClient';
import { I18nProvider } from '@/lib/i18n';
import { getInitialTranslations } from '@/lib/i18n-initial';

export default function HomePage() {
  return (
    <I18nProvider defaultLocale="en" initialMessages={getInitialTranslations('en')}>
      <HomePageContent />
    </I18nProvider>
  );
}
