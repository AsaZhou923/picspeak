'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n';

interface BadgeProps {
  variant?: 'gold' | 'sage' | 'rust' | 'neutral' | 'outline';
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

const variantStyles: Record<string, string> = {
  gold: 'bg-gold/10 text-gold border border-gold/20',
  sage: 'bg-sage/10 text-sage border border-sage/20',
  rust: 'bg-rust/10 text-rust border border-rust/20',
  neutral: 'bg-raised text-ink-muted border border-border',
  outline: 'bg-transparent text-ink-muted border border-border',
};

const sizeStyles: Record<string, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

export default function Badge({ variant = 'neutral', size = 'sm', children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded font-body leading-none ${variantStyles[variant]} ${sizeStyles[size]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  const config: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    PENDING: { label: t('status_pending'), variant: 'neutral' },
    RUNNING: { label: t('status_running'), variant: 'gold' },
    SUCCEEDED: { label: t('status_succeeded'), variant: 'sage' },
    FAILED: { label: t('status_failed'), variant: 'rust' },
    EXPIRED: { label: t('status_expired'), variant: 'rust' },
    READY: { label: t('status_ready'), variant: 'sage' },
    REJECTED: { label: t('status_rejected'), variant: 'rust' },
    UPLOADING: { label: t('status_uploading'), variant: 'gold' },
  };
  const c = config[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={c.variant}>{c.label}</Badge>;
}

export function ModeBadge({ mode }: { mode: string }) {
  return (
    <Badge variant={mode === 'pro' ? 'gold' : 'outline'}>
      {mode === 'pro' ? 'Pro' : 'Flash'}
    </Badge>
  );
}
