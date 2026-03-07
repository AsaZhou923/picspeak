'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Home, RotateCcw } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function ErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <ErrorContent />
    </Suspense>
  );
}

function ErrorContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();

  const ERROR_CONFIGS: Record<
    string,
    { title: string; body: string; action?: { label: string; href: string } }
  > = {
    google_failed: {
      title: t('err_google_failed_title'),
      body: t('err_google_failed_body'),
      action: { label: t('err_google_failed_action'), href: '/workspace' },
    },
    quota_exceeded: {
      title: t('err_quota_exceeded_title'),
      body: t('err_quota_exceeded_body'),
      action: { label: t('err_quota_exceeded_action'), href: '/account/usage' },
    },
    rate_limited: {
      title: t('err_rate_limited_title'),
      body: t('err_rate_limited_body'),
      action: { label: t('err_rate_limited_action'), href: '/workspace' },
    },
    upload_failed: {
      title: t('err_upload_failed_title'),
      body: t('err_upload_failed_body'),
      action: { label: t('err_upload_failed_action'), href: '/workspace' },
    },
    review_rejected: {
      title: t('err_review_rejected_title'),
      body: t('err_review_rejected_body'),
      action: { label: t('err_review_rejected_action'), href: '/workspace' },
    },
    task_failed: {
      title: t('err_task_failed_title'),
      body: t('err_task_failed_body'),
      action: { label: t('err_task_failed_action'), href: '/workspace' },
    },
    not_found: {
      title: t('err_not_found_title'),
      body: t('err_not_found_body'),
    },
    unknown: {
      title: t('err_unknown_title'),
      body: t('err_unknown_body'),
    },
  };

  const code = searchParams.get('code') ?? 'unknown';
  const detail = searchParams.get('detail');

  const config = ERROR_CONFIGS[code] ?? ERROR_CONFIGS['unknown'];

  return (
    <div className="pt-14 min-h-screen flex items-start justify-center px-6">
      <div className="w-full max-w-md py-20 space-y-8 animate-fade-in">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 border border-rust/30 bg-rust/5 rounded-lg flex items-center justify-center">
            <AlertTriangle size={24} className="text-rust" />
          </div>
        </div>

        {/* Text */}
        <div className="text-center space-y-3">
          <p className="text-xs text-rust/70 font-mono tracking-widest uppercase">{code}</p>
          <h1 className="font-display text-3xl sm:text-4xl">{config.title}</h1>
          <p className="text-sm text-ink-muted leading-relaxed">{config.body}</p>
          {detail && (
            <p className="text-xs text-ink-subtle bg-raised border border-border rounded px-3 py-2 font-mono text-left">
              {detail}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col items-center gap-3">
          {config.action && (
            <Link
              href={config.action.href}
              className="flex items-center gap-2 px-6 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
            >
              <RotateCcw size={13} />
              {config.action.label}
            </Link>
          )}
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
          >
            <ArrowLeft size={11} />
            {t('err_back_home')}
          </button>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
          >
            <Home size={11} />
            {t('err_back_home')}
          </Link>
        </div>
      </div>
    </div>
  );
}
