'use client';

import ClerkSignInTrigger from '@/components/auth/ClerkSignInTrigger';
import { useI18n } from '@/lib/i18n';

export default function HomeSignInButton() {
  const { t } = useI18n();

  return (
    <ClerkSignInTrigger
      className="flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold active:scale-[0.98] transition-all duration-200"
      signedInClassName="flex h-[46px] min-w-[46px] items-center justify-center rounded border border-border bg-raised/20 px-2 transition-all duration-200 hover:border-gold/40"
    >
      {t('usage_login_now')}
    </ClerkSignInTrigger>
  );
}
