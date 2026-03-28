'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

const BackgroundEffect = dynamic(() => import('./BackgroundEffect'), {
  ssr: false,
});

function scheduleWhenIdle(callback: () => void, timeout = 1200) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if ('requestIdleCallback' in window) {
    const id = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(id);
  }

  const id = globalThis.setTimeout(callback, timeout);
  return () => globalThis.clearTimeout(id);
}

export default function DeferredBackgroundEffect() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const cancel = scheduleWhenIdle(() => setEnabled(true));
    return cancel;
  }, []);

  if (!enabled) return null;

  return <BackgroundEffect />;
}
