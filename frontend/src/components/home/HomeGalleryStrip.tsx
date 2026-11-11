'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { getPublicGallery } from '@/lib/api';
import type { Translator } from '@/lib/i18n';
import type { PublicGalleryItem } from '@/lib/types';

const FRAME_COUNT = 6;

type StripState = { status: 'loading' } | { status: 'ready'; items: PublicGalleryItem[] } | { status: 'hidden' };

// A strip of the latest public Gallery works under the hero, laid out like a
// row of negatives. It is decorative proof, so a failed or empty request simply
// removes the strip instead of showing an error.
export default function HomeGalleryStrip({ t }: { t: Translator }) {
  const [state, setState] = useState<StripState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    getPublicGallery({ limit: FRAME_COUNT })
      .then((response) => {
        if (cancelled) return;
        const items = response.items.filter((item) => item.photo_thumbnail_url || item.photo_url).slice(0, FRAME_COUNT);
        setState(items.length >= 3 ? { status: 'ready', items } : { status: 'hidden' });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'hidden' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === 'hidden') return null;

  return (
    <div className="relative mx-auto mt-12 max-w-editorial">
      <div className="mb-3 flex items-center justify-between gap-4">
        <p className="ui-rebate">{t('nav_gallery')}</p>
        <Link
          href="/gallery"
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-gold transition-colors hover:text-gold-light"
        >
          {t('nav_gallery')}
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6 sm:gap-2.5">
        {state.status === 'loading'
          ? Array.from({ length: FRAME_COUNT }, (_, index) => (
              <li key={index} aria-hidden="true">
                <div className="aspect-[4/3] rounded-[2px] bg-raised" />
                <div className="h-6" />
              </li>
            ))
          : state.items.map((item, index) => (
              <li key={item.review_id}>
                <Link
                  href={`/reviews/${item.review_id}?back=${encodeURIComponent('/gallery')}`}
                  aria-label={`${t('gallery_open_review')} · ${item.owner_username} · ${item.final_score.toFixed(1)}`}
                  className="group block"
                >
                  <span className="block aspect-[4/3] overflow-hidden rounded-[2px] bg-raised">
                    {/* Signed proxy URLs render more reliably directly than through Next image optimization. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.photo_thumbnail_url || item.photo_url || ''}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover opacity-80 saturate-[0.8] transition duration-500 ease-out group-hover:scale-105 group-hover:opacity-100 group-hover:saturate-100"
                    />
                  </span>
                  <span className="flex h-6 items-end justify-between font-mono text-[11px] tracking-[0.08em] text-ink-subtle" aria-hidden="true">
                    <span>▸ {String(index + 1).padStart(2, '0')}</span>
                    <span className="text-gold">{item.final_score.toFixed(1)}</span>
                  </span>
                </Link>
              </li>
            ))}
      </ul>
    </div>
  );
}
