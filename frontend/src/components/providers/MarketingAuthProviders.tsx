'use client';

import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/lib/auth-context';
import { getClerkLocalization } from '@/lib/clerk-localization';
import { useI18n } from '@/lib/i18n';

export default function MarketingAuthProviders({ children }: { children: ReactNode }) {
  const { locale } = useI18n();

  return (
    <ClerkProvider localization={getClerkLocalization(locale)}>
      <AuthProvider>{children}</AuthProvider>
    </ClerkProvider>
  );
}
