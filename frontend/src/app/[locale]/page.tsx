'use client';

import { I18nProvider, type Locale } from '@/lib/i18n';
import { HomePageContent } from '@/app/page';
import { use } from 'react';
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
export default function LocalePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = use(params);

  // VALID_LOCALES guard is already enforced by the layout, but type-narrow here.
  const pinnedLocale: Locale = VALID_LOCALES.includes(locale as Locale)
    ? (locale as Locale)
    : 'en';

  return (
    <I18nProvider initialLocale={pinnedLocale}>
      <HomePageContent structuredDataScope="locale" />
    </I18nProvider>
  );
}
