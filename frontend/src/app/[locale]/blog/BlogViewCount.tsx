'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Eye } from 'lucide-react';
import { getBlogViewCounts } from '@/lib/api';
import { formatBlogViewCount } from '@/lib/blog-view-stats';
import type { Locale } from '@/lib/i18n';

type BlogViewCountContextValue = {
  locale: Locale;
  viewCounts: Record<string, number>;
};

const BlogViewCountContext = createContext<BlogViewCountContextValue>({
  locale: 'en',
  viewCounts: {},
});

export function BlogViewCountProvider({
  locale,
  slugs,
  children,
}: {
  locale: Locale;
  slugs: string[];
  children: ReactNode;
}) {
  const slugKey = useMemo(
    () =>
      Array.from(
        new Set(
          slugs
            .map((slug) => slug.trim().toLowerCase())
            .filter(Boolean),
        ),
      ).join('\n'),
    [slugs],
  );
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const normalizedSlugs = slugKey ? slugKey.split('\n') : [];
    if (normalizedSlugs.length === 0) {
      setViewCounts({});
      return;
    }

    let cancelled = false;

    void getBlogViewCounts(normalizedSlugs)
      .then((counts) => {
        if (!cancelled) {
          setViewCounts(counts);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setViewCounts({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slugKey]);

  const value = useMemo(() => ({ locale, viewCounts }), [locale, viewCounts]);

  return <BlogViewCountContext.Provider value={value}>{children}</BlogViewCountContext.Provider>;
}

export function BlogViewCount({
  slug,
  className = 'inline-flex items-center gap-2',
}: {
  slug: string;
  className?: string;
}) {
  const { locale, viewCounts } = useContext(BlogViewCountContext);

  return (
    <span className={className}>
      <Eye size={13} className="text-gold/85" />
      {formatBlogViewCount(locale, viewCounts[slug] ?? 0)}
    </span>
  );
}
