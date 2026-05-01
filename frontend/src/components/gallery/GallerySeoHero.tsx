'use client';

import Link from 'next/link';
import { getGallerySeoHeroCopy } from '@/lib/gallery-seo-copy';
import { useI18n } from '@/lib/i18n';

export default function GallerySeoHero() {
  const { locale } = useI18n();
  const copy = getGallerySeoHeroCopy(locale);

  return (
    <section className="mx-auto max-w-7xl px-6 pt-24">
      <div className="grid gap-6 rounded-lg border border-border-subtle bg-raised/35 p-5 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:p-6">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-gold/75">{copy.eyebrow}</p>
          <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">{copy.title}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{copy.body}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link
              href="/workspace"
              className="rounded border border-gold/35 px-4 py-2 text-sm font-medium text-gold transition-colors hover:bg-gold/10"
            >
              {copy.primaryCta}
            </Link>
            <Link
              href="/generate/prompts"
              className="rounded border border-border-subtle px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
            >
              {copy.secondaryCta}
            </Link>
          </div>
        </div>
        <div className="grid gap-3">
          {copy.highlights.map((item) => (
            <article key={item.title} className="rounded-lg border border-border-subtle bg-void/30 p-4">
              <h3 className="font-display text-xl text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
