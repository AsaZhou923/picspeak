'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import { authGoogleCallback } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

type Status = 'processing' | 'success' | 'error';

export default function GoogleCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <LoadingSpinner size={40} label="正在处理登录…" />
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
  const [status, setStatus] = useState<Status>('processing');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setStatus('error');
      setErrorMsg(`Google 授权被拒绝：${errorParam}`);
      return;
    }

    if (!code) {
      setStatus('error');
      setErrorMsg('回调参数缺失，请重新登录');
      return;
    }

    authGoogleCallback(code)
      .then((data) => {
        login(data);
        setStatus('success');
        setTimeout(() => router.push('/workspace'), 1200);
      })
      .catch((err) => {
        setStatus('error');
        if (err instanceof ApiException) {
          setErrorMsg(err.message);
        } else {
          setErrorMsg('登录处理时发生异常，请稍后重试');
        }
      });
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
              <h1 className="font-display text-2xl mb-2">正在处理登录</h1>
              <p className="text-sm text-ink-muted">稍候片刻，正在验证你的 Google 账号…</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="flex justify-center">
              <CheckCircle size={40} className="text-sage" />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">登录成功</h1>
              <p className="text-sm text-ink-muted">正在跳转到评图工作台…</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <XCircle size={40} className="text-rust" />
            </div>
            <div>
              <h1 className="font-display text-2xl mb-2">登录失败</h1>
              <p className="text-sm text-rust/80 bg-rust/5 border border-rust/20 rounded px-4 py-2">
                {errorMsg}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => router.push('/workspace')}
                className="px-6 py-2.5 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
              >
                以游客身份继续
              </button>
              <button
                onClick={() => router.push('/')}
                className="text-xs text-ink-subtle hover:text-ink-muted transition-colors"
              >
                返回首页
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
