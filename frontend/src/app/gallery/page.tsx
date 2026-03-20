'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, LayoutGrid, Star, Trash2 } from 'lucide-react';
import CachedThumbnail from '@/components/ui/CachedThumbnail';
import { useI18n } from '@/lib/i18n';
import { GalleryItem } from '@/lib/types';
import { readGalleryItems, removeGalleryItem } from '@/lib/gallery';

function scoreTone(score: number): string {
  if (score >= 8) return 'text-sage border-sage/30 bg-sage/10';
  if (score >= 6) return 'text-gold border-gold/30 bg-gold/10';
  return 'text-rust border-rust/30 bg-rust/10';
}

function trimSummary(summary: string, maxLength = 120): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

export default function GalleryPage() {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<GalleryItem[]>([]);

  useEffect(() => {
    setItems(readGalleryItems());
  }, []);

  const dateLocale = locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

  const handleRemove = (reviewId: string) => {
    removeGalleryItem(reviewId);
    setItems(readGalleryItems());
  };

  const imageTypeLabel = (imageType: GalleryItem['image_type']) => {
    switch (imageType) {
      case 'landscape':
        return t('image_type_landscape');
      case 'portrait':
        return t('image_type_portrait');
      case 'street':
        return t('image_type_street');
      case 'still_life':
        return t('image_type_still_life');
      case 'architecture':
        return t('image_type_architecture');
      default:
        return t('image_type_default');
    }
  };

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">
        <section className="relative overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.14),transparent_36%),rgba(18,16,13,0.78)] px-6 py-8 sm:px-8 sm:py-10">
          <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.28em] text-gold/80">
                <LayoutGrid size={12} />
                {t('gallery_label')}
              </p>
              <h1 className="font-display text-4xl sm:text-5xl text-ink">{t('gallery_headline')}</h1>
              <p className="mt-3 max-w-xl text-sm leading-7 text-ink-muted">{t('gallery_intro')}</p>
            </div>
            <div className="rounded-2xl border border-border-subtle bg-void/55 px-5 py-4 backdrop-blur-sm">
              <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_count_label')}</p>
              <p className="mt-2 font-display text-4xl text-gold">{items.length}</p>
            </div>
          </div>
        </section>

        {items.length === 0 ? (
          <section className="mt-8 rounded-[24px] border border-border-subtle bg-raised/55 px-6 py-10 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-gold/20 bg-gold/10 text-gold">
              <Star size={20} />
            </div>
            <h2 className="mt-5 font-display text-3xl text-ink">{t('gallery_empty')}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-muted">{t('gallery_empty_body')}</p>
            <Link
              href="/workspace"
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-gold/30 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold/10"
            >
              {t('gallery_empty_cta')}
              <ChevronRight size={14} />
            </Link>
          </section>
        ) : (
          <section className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
              <article
                key={item.review_id}
                className="group overflow-hidden rounded-[26px] border border-border-subtle bg-raised/60 transition-all duration-300 hover:-translate-y-1.5 hover:border-gold/35"
              >
                <div className="relative overflow-hidden border-b border-border-subtle">
                  <CachedThumbnail
                    photoId={item.photo_id}
                    photoUrl={item.photo_thumbnail_url ?? item.photo_url}
                    fallbackUrl={item.photo_url}
                    alt={t('photo_thumbnail_alt')}
                    size={720}
                    sourceIsThumbnail={Boolean(item.photo_thumbnail_url)}
                    containerClassName="h-auto w-full rounded-none border-0 aspect-[4/5] bg-overlay"
                    imageClassName="transition-transform duration-700 group-hover:scale-[1.035]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-void via-void/12 to-transparent opacity-90" />
                  <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-3">
                    <span className={`rounded-full border px-3 py-1 text-sm font-medium shadow-[0_8px_30px_rgba(0,0,0,0.22)] backdrop-blur-sm ${scoreTone(item.final_score)}`}>
                      {item.final_score.toFixed(1)}
                    </span>
                    <div className="flex flex-wrap justify-end gap-2">
                      <span className="rounded-full border border-border-subtle bg-void/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-ink-subtle backdrop-blur-sm">
                        {item.mode}
                      </span>
                      <span className="rounded-full border border-border-subtle bg-void/70 px-2.5 py-1 text-[11px] text-ink backdrop-blur-sm">
                        {imageTypeLabel(item.image_type)}
                      </span>
                    </div>
                  </div>

                  <div className="absolute inset-x-5 bottom-5">
                    <p className="text-[11px] uppercase tracking-[0.24em] text-ink-subtle">{t('gallery_saved_at')}</p>
                    <p className="mt-1 text-base text-ink">
                      {new Date(item.saved_at).toLocaleDateString(dateLocale, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-5">
                  <p className="text-sm leading-7 text-ink-muted">
                    {trimSummary(item.summary || t('gallery_summary_fallback'))}
                  </p>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/reviews/${item.review_id}?back=/gallery`}
                      className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                    >
                      {t('gallery_open_review')}
                      <ChevronRight size={14} />
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleRemove(item.review_id)}
                      className="inline-flex items-center justify-center rounded-full border border-border-subtle px-3 py-2 text-ink-muted transition-colors hover:border-rust/40 hover:text-rust"
                      aria-label={t('gallery_remove')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
