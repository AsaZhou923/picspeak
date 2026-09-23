'use client';

import { useEffect, useRef } from 'react';
import { trackProductAnalyticsEvent } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/** Observe actual visible cards; the server resolves links and deduplicates facts. */
export function usePracticeExposure(
  eventName: 'practice_goal_shown' | 'practice_result_viewed',
  entityId: string | null | undefined,
  locale: 'zh' | 'en' | 'ja',
  enabled = true,
) {
  const targetRef = useRef<HTMLDivElement>(null);
  const sentKey = useRef<string | null>(null);
  const { ensureToken } = useAuth();

  useEffect(() => {
    const target = targetRef.current;
    if (!enabled || !entityId || !target) return;
    const key = `${eventName}:${entityId}`;
    let disposed = false;
    let intersects = false;
    let sending = false;
    const emit = async () => {
      if (disposed || sending || !intersects || document.hidden || sentKey.current === key) return;
      sending = true;
      try {
        const token = await ensureToken();
        if (disposed || !intersects || document.hidden) return;
        await trackProductAnalyticsEvent({
          event_name: eventName, source: 'retake_coach', locale,
          metadata: eventName === 'practice_goal_shown'
            ? { source_review_id: entityId }
            : { attempt_id: entityId },
        }, token);
        sentKey.current = key;
      } catch {
        // A later visibility transition or page load may retry; dedupe is server-side.
      } finally {
        sending = false;
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      intersects = entry.isIntersecting;
      void emit();
    });
    observer.observe(target);
    const onVisibility = () => { void emit(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, ensureToken, entityId, eventName, locale]);

  return targetRef;
}
