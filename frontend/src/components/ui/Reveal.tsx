'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || inView) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [inView]);

  return [ref, inView];
}

/**
 * Fades its children up once they scroll into view. Content is rendered (and
 * readable by crawlers and assistive technology) from the start; only opacity
 * and offset change.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`ui-reveal ${inView ? 'ui-reveal-in' : ''} ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

/** Counts up to a score when it first becomes visible. */
export function CountUp({
  value,
  decimals = 1,
  duration = 1100,
  delay = 0,
}: {
  value: number;
  decimals?: number;
  duration?: number;
  delay?: number;
}) {
  const [ref, inView] = useInView<HTMLSpanElement>();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (!inView || prefersReducedMotion()) {
      setShown(value);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    setShown(0);
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (start === null) start = now;
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setShown(value * eased);
        if (progress < 1) frame = window.requestAnimationFrame(step);
        else setShown(value);
      };
      frame = window.requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      window.cancelAnimationFrame(frame);
    };
  }, [inView, value, duration, delay]);

  return (
    <span ref={ref} aria-label={value.toFixed(decimals)}>
      <span aria-hidden="true">{shown.toFixed(decimals)}</span>
    </span>
  );
}
