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
    <section className="mx-auto max-w-editorial px-6 py-12">
      <div className="ui-feature-panel grid gap-8 p-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:p-8">
        <div className="min-w-0">
          <p className="ui-eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl text-ink sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">{copy.body}</p>
          <div className="mt-5 flex flex-wrap gap-3">
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
              className="ui-action-primary px-5 py-2.5 text-sm"
            >
              {copy.primaryCta}
            </Link>
            <Link
              href="/generate/prompts"
              className="ui-action-secondary px-5 py-2.5 text-sm"
            >
              {copy.secondaryCta}
            </Link>
            <Link
              href={`/reviews/${DEMO_REVIEW_ID}`}
              className="ui-action-secondary px-5 py-2.5 text-sm"
            >
              {copy.exampleCta}
            </Link>
          </div>
        </div>
        <div className="grid gap-3">
          {copy.highlights.map((item) => (
            <article key={item.title} className="rounded-card border border-border-subtle bg-void/35 p-4">
              <h2 className="font-display text-xl text-ink">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
