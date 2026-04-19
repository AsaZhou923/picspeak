import { useEffect, useState } from 'react';
import { getUsage } from '@/lib/api';
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
    ensureToken()
      .then((token) => getUsage(token))
      .then((data) => {
        setUsage(data);
        setUsageError('');
      })
      .catch((err) => {
        console.error('Failed to fetch usage on review page', err);
        setUsageError(formatUserFacingError(t, err, t('usage_error')));
      });
  }, [ensureToken, t]);

  return { usage, usageError };
}
