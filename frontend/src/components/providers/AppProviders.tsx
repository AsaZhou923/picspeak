'use client';

import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth-context';
import { getClerkLocalization } from '@/lib/clerk-localization';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { ThemeProvider } from '@/lib/theme-context';

function LocalizedClerkProvider({ children }: { children: ReactNode }) {
  const { locale } = useI18n();

  return <ClerkProvider localization={getClerkLocalization(locale)}>{children}</ClerkProvider>;
}

export default function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <LocalizedClerkProvider>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </LocalizedClerkProvider>
    </I18nProvider>
  );
}
