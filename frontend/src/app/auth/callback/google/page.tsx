'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { AuthToken } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Status = 'processing' | 'success' | 'error';

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

    const accessToken = readParam('access_token');
    const tokenType = readParam('token_type') ?? 'bearer';
    const userId = readParam('user_id');
    const plan = readParam('plan');

    if (!accessToken || !userId || !plan) {
      setStatus('error');
      setErrorMsg(t('auth_error_missing_params'));
      return;
    }

    const authData: AuthToken = {
      access_token: accessToken,
      token_type: tokenType,
      user_id: userId,
      plan: plan as AuthToken['plan'],
    };

    login(authData);
    setStatus('success');
    setTimeout(() => router.push('/workspace'), 1200);
  }, [searchParams, login, router]);

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

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <CheckCircle size={40} className="text-sage" />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">{t('auth_success_title')}</h1>
              <p className="text-sm text-ink-muted">{t('auth_success_body')}</p>
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
