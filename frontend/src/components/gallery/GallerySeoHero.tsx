'use client';

import Link from 'next/link';
import { buildWorkspaceConversionHref } from '@/lib/content-conversion';
import { getGallerySeoHeroCopy } from '@/lib/gallery-seo-copy';
import { useI18n } from '@/lib/i18n';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';

export default function GallerySeoHero() {
  const { locale } = useI18n();
  const copy = getGallerySeoHeroCopy(locale);

  return (
    <section className="border-b border-border-subtle bg-surface/35">
      <div className="mx-auto flex max-w-editorial flex-col gap-4 px-6 py-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 max-w-4xl">
          <p className="ui-eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-2 max-w-3xl font-display text-2xl text-ink sm:text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
          <Link
            href={buildWorkspaceConversionHref({ source: 'gallery', entrypoint: 'gallery_practice' })}
            onClick={() => {
              markProductAttributionSource('gallery');
              void trackProductEvent('content_workspace_clicked', {
                source: 'gallery',
                pagePath: '/gallery',
                locale,
                metadata: { entrypoint: 'gallery_practice', hero: true },
              });
            }}
            className="ui-action-primary min-h-11 px-4 py-2 text-sm"
          >
            {copy.primaryCta}
          </Link>
          <Link
            href={`/reviews/${DEMO_REVIEW_ID}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted transition-colors hover:text-gold"
          >
            {copy.exampleCta}
          </Link>
        </div>
      </div>
    </section>
  );
}
