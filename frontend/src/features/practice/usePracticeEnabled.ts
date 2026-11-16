'use client';

import { useEffect, useState } from 'react';
import { getPracticeConfig } from '@/lib/api';

let cachedPracticeEnabled: boolean | null = null;
let inflightPracticeConfig: Promise<boolean> | null = null;

function fetchPracticeEnabledShared(): Promise<boolean> {
  if (cachedPracticeEnabled !== null) {
    return Promise.resolve(cachedPracticeEnabled);
  }
  if (!inflightPracticeConfig) {
    inflightPracticeConfig = getPracticeConfig()
      .then((config) => {
        const enabled = config.practice_enabled === true;
        cachedPracticeEnabled = enabled;
        return enabled;
      })
      .catch(() => false)
      .finally(() => {
        inflightPracticeConfig = null;
      });
  }
  return inflightPracticeConfig;
}

export function resetPracticeEnabledCacheForTests(): void {
  cachedPracticeEnabled = null;
  inflightPracticeConfig = null;
}

export function usePracticeEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(() => cachedPracticeEnabled);

  useEffect(() => {
    if (cachedPracticeEnabled !== null) {
      setEnabled(cachedPracticeEnabled);
      return;
    }

    let cancelled = false;
    void fetchPracticeEnabledShared().then((value) => {
      if (!cancelled) {
        setEnabled(value);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return enabled;
}
