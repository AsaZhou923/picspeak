'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth-context';
import { getClerkLocalization } from '@/lib/clerk-localization';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme-context';
import { isMarketingRoute } from '@/lib/route-shell';

function LocalizedClerkProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();

  return <ClerkProvider localization={getClerkLocalization(locale)}>{children}</ClerkProvider>;
}

function RouteScopedProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (isMarketingRoute(pathname)) {
    return <ThemeProvider>{children}</ThemeProvider>;
  }

  return (
    <LocalizedClerkProvider>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </LocalizedClerkProvider>
  );
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <RouteScopedProviders>{children}</RouteScopedProviders>
    </I18nProvider>
  );
}
