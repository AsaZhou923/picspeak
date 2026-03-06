import React from 'react';

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
  const config: Record<string, { label: string; variant: BadgeProps['variant'] }> = {
    PENDING: { label: '等待中', variant: 'neutral' },
    RUNNING: { label: '处理中', variant: 'gold' },
    SUCCEEDED: { label: '已完成', variant: 'sage' },
    FAILED: { label: '已失败', variant: 'rust' },
    EXPIRED: { label: '已过期', variant: 'rust' },
    READY: { label: '就绪', variant: 'sage' },
    REJECTED: { label: '已拒绝', variant: 'rust' },
    UPLOADING: { label: '上传中', variant: 'gold' },
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
