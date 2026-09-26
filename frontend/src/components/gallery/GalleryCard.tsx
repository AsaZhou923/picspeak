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

function scoreTone(score: number): string {
  if (score >= 8) return 'text-sage border-sage/30 bg-sage/10';
  if (score >= 6) return 'text-gold border-gold/30 bg-gold/10';
  return 'text-rust border-rust/30 bg-rust/10';
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
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface/70 shadow-level-1 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/25 hover:bg-surface animate-slide-up"
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
      }}
    >
      <div className="overflow-hidden">
        <GalleryCardImage item={item} alt={t('photo_thumbnail_alt')} compact={isCompact} />
      </div>

      <div className={`flex flex-1 flex-col px-4 pb-4 ${isCompact ? 'pt-3' : 'pt-4'}`}>
        <div className="flex min-w-0 items-center justify-between gap-3 text-xs text-ink-subtle">
          <div className="flex min-w-0 items-center gap-2">
            {item.owner_avatar_url ? (
              <Image
                src={item.owner_avatar_url}
                alt={author.label}
                width={24}
                height={24}
                className="h-6 w-6 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-action text-[10px] font-semibold text-action-ink">
                {author.initial}
              </span>
            )}
            {item.owner_profile_url ? (
              <Link
                href={item.owner_profile_url}
                className="truncate text-sm font-medium text-ink transition-colors hover:text-gold"
                onClick={(event) => event.stopPropagation()}
              >
                {author.label}
              </Link>
            ) : (
              <span className="truncate text-sm font-medium text-ink">{author.label}</span>
            )}
          </div>
          <time className="shrink-0 [font-variant-numeric:tabular-nums]" dateTime={item.gallery_added_at}>
            {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreTone(
              item.final_score
            )}`}
          >
            {item.final_score.toFixed(1)}
          </span>
          {item.recommended && (
            <span className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold">
              {t('gallery_recommended')}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${modeBadge.className}`}
          >
            <ModeIcon size={11} strokeWidth={1.8} className={modeBadge.iconClassName} />
            {modeBadge.label}
          </span>
        </div>

        {!isCompact && (
          <p
            className="mt-3 text-xs leading-6 text-ink-muted"
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

        <div className={`mt-auto flex items-center gap-2 ${isCompact ? 'pt-3' : 'pt-4'}`}>
          <button
            type="button"
            onClick={() => void handleLikeToggle(item)}
            disabled={likeBusyId === item.review_id}
            className={`inline-flex min-h-11 min-w-16 items-center justify-center gap-1.5 rounded-control border px-3 py-2 text-sm transition-all active:scale-95 disabled:opacity-60 ${
              item.liked_by_viewer
                ? 'border-rust/35 bg-rust/10 text-rust hover:bg-rust/15'
                : 'border-border text-ink-muted hover:border-rust/35 hover:text-rust'
            }`}
            aria-pressed={item.liked_by_viewer}
            aria-label={item.liked_by_viewer ? t('gallery_unlike') : t('gallery_like')}
          >
            <Heart
              size={14}
              className={`transition-transform duration-300 ${item.liked_by_viewer ? 'fill-current scale-110' : 'group-hover:scale-110'}`}
            />
            <span>{item.like_count}</span>
          </button>

          <Link
            href={reviewHref}
            onClick={() => persistGalleryState(item.review_id)}
            className="ui-action-primary min-h-11 flex-1 rounded-control px-3 py-2 text-sm active:scale-[0.98]"
          >
            {t('gallery_open_review')}
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className={`flex flex-wrap gap-x-3 gap-y-2 border-t border-border-subtle pt-3 ${isCompact ? 'mt-3' : 'mt-4'}`}>
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
