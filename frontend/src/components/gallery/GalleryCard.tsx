'use client';

import Link from 'next/link';
import Image from 'next/image';
import { memo } from 'react';
import { Camera, ChevronRight, Gauge, Heart, Sparkles, Star, Zap } from 'lucide-react';
import type { PublicGalleryItem, GalleryDensityPreference } from '@/lib/gallery-ux-types';
import { useI18n } from '@/lib/i18n';
import { getGalleryWorkspaceCtas, type ContentConversionEntrypoint } from '@/lib/content-conversion';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';
import GalleryCardImage from './GalleryCardImage';

interface GalleryCardProps {
  item: PublicGalleryItem;
  index: number;
  likeBusyId: string | null;
  handleLikeToggle: (item: PublicGalleryItem) => Promise<void>;
  persistGalleryState: (reviewId: string) => void;
  backHref: string;
  galleryQuery: string;
  dateLocale: string;
  density?: GalleryDensityPreference;
}

function trimSummary(summary: string, maxLength = 78): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trim()}...`;
}

function getAuthorBadge(username: string) {
  const normalized = username.trim();
  return {
    initial: normalized.charAt(0).toUpperCase() || 'P',
    label: normalized || 'PicSpeak',
  };
}

function getModeBadgeConfig(mode: PublicGalleryItem['mode']) {
  if (mode === 'pro') {
    return {
      label: 'Pro',
      icon: Star,
      className: 'border-gold/30 bg-void/50 text-gold',
      iconClassName: 'text-gold/90',
    };
  }

  return {
    label: 'Flash',
    icon: Zap,
    className: 'border-border-subtle bg-void/50 text-ink-muted',
    iconClassName: 'text-ink-subtle',
  };
}

function GalleryCard({
  item,
  index,
  likeBusyId,
  handleLikeToggle,
  persistGalleryState,
  backHref,
  galleryQuery,
  dateLocale,
  density = 'full',
}: GalleryCardProps) {
  const { t, locale } = useI18n();
  const author = getAuthorBadge(item.owner_username);
  const modeBadge = getModeBadgeConfig(item.mode);
  const ModeIcon = modeBadge.icon;
  const workspaceCtas = getGalleryWorkspaceCtas(locale, item);
  const isCompact = density === 'compact';
  const generateHref = `/generate?source=gallery&entrypoint=gallery_reference_generation&gallery_review_id=${encodeURIComponent(item.review_id)}&image_type=${encodeURIComponent(item.image_type)}`;
  const reviewHref = `/reviews/${item.review_id}?back=${encodeURIComponent(backHref)}&gallery_query=${encodeURIComponent(galleryQuery)}`;

  const handleWorkspaceCtaClick = (entrypoint: ContentConversionEntrypoint) => {
    markProductAttributionSource('gallery');
    void trackProductEvent('content_workspace_clicked', {
      source: 'gallery',
      pagePath: '/gallery',
      locale,
      metadata: {
        entrypoint,
        gallery_review_id: item.review_id,
        image_type: item.image_type,
        final_score: item.final_score,
      },
    });
  };

  return (
    <article
      data-review-id={item.review_id}
      className="group flex flex-col animate-slide-up"
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* The photograph is the card: it opens the critique and carries author and score. */}
      <div className="relative overflow-hidden rounded-[4px]">
        <Link
          href={reviewHref}
          onClick={() => persistGalleryState(item.review_id)}
          aria-label={`${t('gallery_open_review')} · ${author.label} · ${item.final_score.toFixed(1)}`}
          className="block"
        >
          <GalleryCardImage item={item} alt={t('photo_thumbnail_alt')} compact={isCompact} />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/65 to-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-3 right-3.5 font-display text-3xl font-black leading-none text-white"
          >
            {item.final_score.toFixed(1)}
          </span>
        </Link>

        <div className="absolute bottom-2.5 left-3 flex max-w-[65%] items-center gap-2 text-white">
          {item.owner_avatar_url ? (
            <Image
              src={item.owner_avatar_url}
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 shrink-0 rounded-full border border-white/40 object-cover"
            />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-[10px] font-semibold text-action-ink">
              {author.initial}
            </span>
          )}
          {item.owner_profile_url ? (
            <Link
              href={item.owner_profile_url}
              className="truncate py-2 text-sm font-medium text-white underline-offset-4 hover:underline"
            >
              {author.label}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{author.label}</span>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-ink-subtle">
          {item.recommended && (
            <span className="font-medium text-gold">{t('gallery_recommended')}</span>
          )}
          <span className="inline-flex items-center gap-1">
            <ModeIcon size={11} strokeWidth={1.8} className={modeBadge.iconClassName} aria-hidden="true" />
            {modeBadge.label}
          </span>
          <time className="ml-auto shrink-0 [font-variant-numeric:tabular-nums]" dateTime={item.gallery_added_at}>
            {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </div>

        {!isCompact && (
          <p
            className="mt-2 text-sm leading-6 text-ink-muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {trimSummary(item.summary || t('gallery_summary_fallback'))}
          </p>
        )}

        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => void handleLikeToggle(item)}
            disabled={likeBusyId === item.review_id}
            className={`-ml-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm transition-colors active:scale-95 disabled:opacity-60 ${
              item.liked_by_viewer ? 'text-rust' : 'text-ink-muted hover:text-rust'
            }`}
            aria-pressed={item.liked_by_viewer}
            aria-label={item.liked_by_viewer ? t('gallery_unlike') : t('gallery_like')}
          >
            <Heart
              size={15}
              className={`transition-transform duration-300 ${item.liked_by_viewer ? 'fill-current scale-110' : ''}`}
            />
            <span>{item.like_count}</span>
          </button>

          <Link
            href={reviewHref}
            onClick={() => persistGalleryState(item.review_id)}
            className="ml-auto inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-gold transition-colors hover:text-gold-dim"
          >
            {t('gallery_open_review')}
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-x-4 border-t border-border-subtle">
          <Link
            href={workspaceCtas.practice.href}
            onClick={() => handleWorkspaceCtaClick(workspaceCtas.practice.entrypoint)}
            className="inline-flex min-h-11 items-center gap-1.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-gold"
          >
            <Camera size={12} />
            {workspaceCtas.practice.title}
          </Link>
          <Link
            href={workspaceCtas.standard.href}
            onClick={() => handleWorkspaceCtaClick(workspaceCtas.standard.entrypoint)}
            className="inline-flex min-h-11 items-center gap-1.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-gold"
          >
            <Gauge size={12} />
            {workspaceCtas.standard.cta}
          </Link>
          {!isCompact && (
          <Link
            href={generateHref}
            onClick={() => {
              markProductAttributionSource('gallery');
              void trackProductEvent('generation_prompt_opened', {
                source: 'gallery',
                pagePath: '/gallery',
                locale,
                metadata: {
                  entrypoint: 'gallery_reference_generation',
                  gallery_review_id: item.review_id,
                  image_type: item.image_type,
                },
              });
            }}
            className="inline-flex min-h-11 items-center gap-1.5 py-1 text-xs font-medium text-ink-muted transition-colors hover:text-sage"
          >
            <Sparkles size={12} />
            {locale === 'zh' ? '生成同题材练习参考' : locale === 'ja' ? '同じ題材の参考を生成' : 'Generate practice reference'}
          </Link>
          )}
        </div>
      </div>
    </article>
  );
}

export default memo(GalleryCard);
