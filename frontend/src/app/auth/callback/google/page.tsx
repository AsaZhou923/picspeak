'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader, ArrowDownToLine } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { AuthToken } from '@/lib/types';
import { migrateGuestReviews } from '@/lib/api';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { formatUserFacingError } from '@/lib/error-utils';

type Status = 'processing' | 'migrate_prompt' | 'migrating' | 'done' | 'error';

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner size={40} label="..." />
        </div>
      }
    >
      <GoogleCallbackInner />
    </Suspense>
  );
}

function GoogleCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('processing');
  const [errorMsg, setErrorMsg] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [migratedCount, setMigratedCount] = useState<number | null>(null);
  const redirectedRef = useRef(false);

  const goWorkspace = useCallback(() => {
    if (!redirectedRef.current) {
      redirectedRef.current = true;
      router.push('/workspace');
    }
  }, [router]);

  useEffect(() => {
    const hashParams = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.hash.replace(/^#/, ''))
      : null;

    const readParam = (key: string): string | null => {
      const fromQuery = searchParams.get(key);
      if (fromQuery) return fromQuery;
      return hashParams?.get(key) ?? null;
    };

    const errorParam = readParam('error');

    if (errorParam) {
      setStatus('error');
      setErrorMsg(decodeURIComponent(errorParam));
      return;
    }

    const token = readParam('access_token');
    const tokenType = readParam('token_type') ?? 'bearer';
    const userId = readParam('user_id');
    const plan = readParam('plan');

    if (!token || !userId || !plan) {
      setStatus('error');
      setErrorMsg(t('auth_error_missing_params'));
      return;
    }

    const authData: AuthToken = {
      access_token: token,
      token_type: tokenType,
      user_id: userId,
      plan: plan as AuthToken['plan'],
    };

    login(authData);
    setAccessToken(token);
    setStatus('migrate_prompt');
  }, [searchParams, login, t]);

  const handleMigrate = useCallback(async () => {
    setStatus('migrating');
    try {
      const result = await migrateGuestReviews(accessToken);
      setMigratedCount(result.migrated_reviews);
    } catch (err) {
      setStatus('error');
      setErrorMsg(formatUserFacingError(t, err, t('auth_migrate_failed')));
      return;
    }
    setStatus('done');
    setTimeout(goWorkspace, 1800);
  }, [accessToken, goWorkspace, t]);

  const handleSkip = useCallback(() => {
    goWorkspace();
  }, [goWorkspace]);

  const doneMsg =
    migratedCount === null || migratedCount === 0
      ? t('auth_migrate_none')
      : t('auth_migrate_done').replace('{count}', String(migratedCount));

  return (
    <div className="min-h-screen flex items-center justify-center px-6 pt-14">
      <div className="w-full max-w-sm text-center space-y-6 animate-fade-in">
        {status === 'processing' && (
          <>
            <div className="flex justify-center">
              <Loader size={40} className="text-gold animate-spin-slow" style={{ animationDuration: '2s' }} />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">{t('auth_processing_title')}</h1>
              <p className="text-sm text-ink-muted">{t('auth_processing_body')}</p>
            </div>
          </>
        )}

        {status === 'migrate_prompt' && (
          <>
            <div className="flex justify-center">
              <CheckCircle size={40} className="text-sage" />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">{t('auth_migrate_title')}</h1>
              <p className="text-sm text-ink-muted">{t('auth_migrate_body')}</p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleMigrate}
                className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
              >
                <ArrowDownToLine size={15} />
                {t('auth_migrate_confirm')}
              </button>
              <button
                onClick={handleSkip}
                className="text-sm text-ink-subtle hover:text-ink-muted transition-colors"
              >
                {t('auth_migrate_skip')}
              </button>
            </div>
          </>
        )}

        {status === 'migrating' && (
          <>
            <div className="flex justify-center">
              <Loader size={40} className="text-gold animate-spin-slow" style={{ animationDuration: '2s' }} />
            </div>
            <div>
              <p className="text-sm text-ink-muted">{t('auth_migrating_body')}</p>
            </div>
          </>
        )}

        {status === 'done' && (
          <>
            <div className="flex justify-center">
              <CheckCircle size={40} className="text-sage" />
            </div>
            <div>
              <p className="text-sm text-ink-muted">{doneMsg}</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <XCircle size={40} className="text-rust" />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">{t('auth_error_title')}</h1>
              <p className="text-sm text-rust/80 bg-rust/5 border border-rust/20 rounded px-4 py-2">
                {errorMsg}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.push('/workspace')}
                className="px-6 py-2.5 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
              >
                {t('auth_continue_guest')}
              </button>
              <button
                onClick={() => router.push('/')}
                className="text-xs text-ink-subtle hover:text-ink-muted transition-colors"
              >
                {t('auth_back_home')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
