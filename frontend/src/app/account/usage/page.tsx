'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { getUsage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { UsageResponse, ApiException } from '@/lib/types';
import { buildGoogleOAuthUrl } from '@/lib/api';
import LoadingSpinner, { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';

function UsageBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? (used / total) * 100 : 0;
  const color = pct >= 90 ? 'bg-rust' : pct >= 60 ? 'bg-gold' : 'bg-sage';
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-xs text-ink-muted">
        <span>今日已用 {used} 次</span>
        <span>共 {total} 次</span>
      </div>
      <div className="w-full h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function UsagePage() {
  const { ensureToken, userInfo } = useAuth();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError('获取额度信息失败');
        }
      });
  }, [ensureToken]);

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
        {/* Header */}
        <div className="mb-10">
          <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
            — 账户状态
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">我的额度</h1>
        </div>

        {loading ? (
          <div className="space-y-4">
            <SkeletonBlock className="h-28 w-full" />
            <SkeletonBlock className="h-28 w-full" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : usage ? (
          <div className="space-y-4">
            {/* Identity card */}
            <div className="border border-border-subtle rounded-lg bg-raised p-6">
              <p className="text-xs text-ink-subtle mb-3">当前身份</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-2xl font-display ${planColor(usage.plan)}`}>
                    {planLabel(usage.plan)}
                  </p>
                  {userInfo?.user_id && (
                    <p className="text-xs text-ink-subtle font-mono mt-1 truncate max-w-[200px]">
                      {userInfo.user_id}
                    </p>
                  )}
                </div>
                {usage.plan === 'guest' && (
                  <a
                    href={buildGoogleOAuthUrl()}
                    className="flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
                  >
                    升级账户
                    <ArrowRight size={11} />
                  </a>
                )}
              </div>
            </div>

            {/* Quota card */}
            <div className="border border-border-subtle rounded-lg bg-raised p-6 space-y-4">
              <p className="text-xs text-ink-subtle">今日评图额度</p>
              <div className="flex items-end gap-2">
                <span className="font-display text-4xl text-ink">
                  {usage.quota.remaining}
                </span>
                <span className="text-ink-muted mb-1.5 text-sm">
                  / {usage.quota.daily_total} 次剩余
                </span>
              </div>
              <UsageBar used={usage.quota.used} total={usage.quota.daily_total} />
              {usage.quota.remaining === 0 && (
                <p className="text-xs text-rust">
                  今日额度已用完，次日 UTC 0:00 自动重置
                </p>
              )}
            </div>

            {/* Rate limit card */}
            <div className="border border-border-subtle rounded-lg bg-raised p-6 space-y-3">
              <p className="text-xs text-ink-subtle">分钟级限流</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-display text-ink">
                    {usage.rate_limit.remaining}
                  </p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    / {usage.rate_limit.limit_per_min} 次/分钟 剩余
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-subtle">重置时间</p>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">
                    {new Date(usage.rate_limit.reset_at).toLocaleTimeString('zh-CN')}
                  </p>
                </div>
              </div>
            </div>

            {/* Plan comparison */}
            {usage.plan === 'guest' && (
              <div className="border border-gold/15 rounded-lg bg-gold/5 p-5 space-y-3">
                <p className="text-sm text-gold font-medium">登录解锁更多额度</p>
                <p className="text-xs text-ink-muted leading-relaxed">
                  游客每日仅 3 次评图。Google 登录后升级为 Free 用户，享有每日 6 次评图 + 历史记录保留。
                </p>
                <a
                  href={buildGoogleOAuthUrl()}
                  className="inline-flex items-center gap-1.5 text-sm text-gold hover:text-gold-light transition-colors"
                >
                  立即登录 <ArrowRight size={12} />
                </a>
              </div>
            )}
          </div>
        ) : null}

        {/* Back link */}
        <div className="mt-10">
          <Link
            href="/workspace"
            className="text-sm text-ink-muted hover:text-ink transition-colors flex items-center gap-1.5"
          >
            前往评图工作台 →
          </Link>
        </div>
      </div>
    </div>
  );
}
