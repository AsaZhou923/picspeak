'use client';

import { Show, SignUpButton } from '@clerk/nextjs';
import { useI18n } from '@/lib/i18n';

export default function HomeSignUpButton() {
  const { t } = useI18n();

  return (
    <Show when="signed-out">
      <SignUpButton mode="modal" fallbackRedirectUrl="/workspace">
        <button
          type="button"
          className="flex items-center gap-2 px-7 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold active:scale-[0.98] transition-all duration-200"
        >
          {t('usage_signup_now')}
        </button>
      </SignUpButton>
    </Show>
  );
}
