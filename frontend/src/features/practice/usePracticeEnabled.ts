'use client';

import { useEffect, useState } from 'react';
import { getPracticeConfig } from '@/lib/api';

export function usePracticeEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    getPracticeConfig(undefined, controller.signal)
      .then((config) => { if (!controller.signal.aborted) setEnabled(config.practice_enabled === true); })
      .catch(() => { if (!controller.signal.aborted) setEnabled(false); });
    return () => controller.abort();
  }, []);
  return enabled;
}
