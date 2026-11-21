'use client';

import { type Translator } from '@/lib/i18n';

interface AuthUnavailableNoticeProps {
  t: Translator;
  onRetry?: () => void;
  className?: string;
}

/** Localized Clerk-outage state with retry, shown instead of a sign-in prompt to signed-in browsers (#108). */
export default function AuthUnavailableNotice({ t, onRetry, className = '' }: AuthUnavailableNoticeProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <div role="alert" className={`space-y-3 rounded-control border border-rust/25 bg-rust/10 px-4 py-3 text-sm text-rust ${className}`.trim()}>
      <p className="leading-6">{t('err_auth_unavailable_body')}</p>
      <button
        type="button"
        onClick={handleRetry}
        className="min-h-11 rounded-sm border border-border bg-surface/80 px-4 text-xs font-medium text-ink transition-colors hover:border-ink-muted"
      >
        {t('app_error_retry')}
      </button>
    </div>
  );
}
