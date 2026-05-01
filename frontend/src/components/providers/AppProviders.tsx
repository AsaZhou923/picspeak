'use client';

import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth-context';
import { getClerkLocalization } from '@/lib/clerk-localization';
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n';
import type { TranslationDictionary } from '@/lib/i18n-en';
import { ThemeProvider } from '@/lib/theme-context';
import { AppErrorBoundary } from '@/components/providers/AppErrorBoundary';
import ProductAnalyticsProvider from '@/components/providers/ProductAnalyticsProvider';

function LocalizedClerkProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();

  return <ClerkProvider localization={getClerkLocalization(locale)}>{children}</ClerkProvider>;
}

function RouteScopedProviders({ children }: { children: ReactNode }) {
  return (
    <LocalizedClerkProvider>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={null}>
            <ProductAnalyticsProvider>{children}</ProductAnalyticsProvider>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </LocalizedClerkProvider>
  );
}

function ProviderErrorFallback({ reset }: { reset: () => void }) {
  const { t } = useI18n();

  return (
    <main className="flex min-h-screen items-center justify-center bg-void px-6 py-16 text-ink">
      <section role="alert" className="w-full max-w-md rounded-lg border border-border-subtle bg-surface/90 p-6 shadow-[0_18px_50px_rgba(0,0,0,0.14)]">
        <p className="font-display text-3xl leading-tight">{t('app_error_title')}</p>
        <p className="mt-3 text-sm leading-7 text-ink-muted">{t('app_error_body')}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 rounded-full border border-border px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-gold"
        >
          {t('app_error_retry')}
        </button>
      </section>
    </main>
  );
}

export default function AppProviders({
  children,
  initialLocale,
  initialMessages,
}: {
  children: ReactNode;
  initialLocale?: Locale;
  initialMessages?: TranslationDictionary;
}) {
  return (
    <I18nProvider initialLocale={initialLocale} initialMessages={initialMessages}>
      <AppErrorBoundary fallback={(reset) => <ProviderErrorFallback reset={reset} />}>
        <RouteScopedProviders>{children}</RouteScopedProviders>
      </AppErrorBoundary>
    </I18nProvider>
  );
}
