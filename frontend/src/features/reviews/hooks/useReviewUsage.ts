import { useEffect, useState } from 'react';
import { getUsage, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { UsageResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';

export function useReviewUsage() {
  const { ensureToken } = useAuth();
  const { t } = useI18n();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    ensureToken()
      .then((token) => getUsage(token, { signal: controller.signal }))
      .then((data) => {
        setUsage(data);
        setUsageError('');
      })
      .catch((err) => {
        if (isAbortError(err)) return;
        console.error('Failed to fetch usage on review page', err);
        setUsageError(formatUserFacingError(t, err, t('usage_error')));
      });
    return () => {
      controller.abort();
    };
  }, [ensureToken, t]);

  return { usage, usageError };
}
