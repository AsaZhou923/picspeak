import { useCallback, useEffect, useState } from 'react';
import { getUsage, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { UsageResponse } from '@/lib/types';
import { logClientError } from '@/lib/client-log';

function getEffectiveQuota(
  usage: UsageResponse | null,
  reviewMode: 'flash' | 'pro'
): { remaining: number | null; total: number | null } {
  if (!usage) return { remaining: null, total: null };

  const candidates: Array<{ remaining: number; total: number }> = [];
  const { daily_remaining, daily_total, monthly_remaining, monthly_total, pro_monthly_remaining, pro_monthly_total } =
    usage.quota;

  if (daily_remaining !== null && daily_total !== null)
    candidates.push({ remaining: daily_remaining, total: daily_total });
  if (monthly_remaining !== null && monthly_total !== null)
    candidates.push({ remaining: monthly_remaining, total: monthly_total });
  if (reviewMode === 'pro' && pro_monthly_remaining !== null && pro_monthly_total !== null)
    candidates.push({ remaining: pro_monthly_remaining, total: pro_monthly_total });

  if (candidates.length === 0) return { remaining: null, total: null };

  return candidates.reduce((curr, cand) => (cand.remaining < curr.remaining ? cand : curr));
}

export function useWorkspaceUsage(reviewMode: 'flash' | 'pro') {
  const { userInfo, ensureToken, isLoading: authLoading, syncPlan, captureAuthOwner } = useAuth();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState(false);

  const currentPlan = (userInfo?.plan ?? usage?.plan ?? 'guest') as 'guest' | 'free' | 'pro';
  const isGuest = currentPlan === 'guest';
  const { remaining: remainingQuota, total: totalQuota } = getEffectiveQuota(usage, reviewMode);

  const fetchUsage = useCallback(async (options: { signal?: AbortSignal; force?: boolean } = {}) => {
    const isOwnerCurrent = captureAuthOwner(userInfo?.user_id ?? null);
    if (!isOwnerCurrent()) return null;
    try {
      setUsageError(false);
      const tok = await ensureToken();
      if (!isOwnerCurrent() || options.signal?.aborted) return null;
      const data = await getUsage(tok, { force: options.force, signal: options.signal });
      if (options.signal?.aborted || !isOwnerCurrent()) return null;
      syncPlan(data.plan);
      setUsage(data);
      return data;
    } catch (err) {
      if (isAbortError(err) || !isOwnerCurrent() || options.signal?.aborted) return null;
      logClientError('Failed to fetch usage in workspace', err);
      setUsageError(true);
      return null;
    }
  }, [ensureToken, syncPlan, captureAuthOwner, userInfo?.user_id]);

  useEffect(() => {
    if (authLoading) return;
    const controller = new AbortController();
    setUsage(null);
    void fetchUsage({ signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, [authLoading, userInfo?.access_token, fetchUsage]);

  return { usage, usageError, fetchUsage, currentPlan, isGuest, remainingQuota, totalQuota };
}
