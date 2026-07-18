'use client';

import Link from 'next/link';
import Image from 'next/image';
import { memo } from 'react';
import { Camera, ChevronRight, Gauge, Heart, Sparkles, Star, Zap } from 'lucide-react';
import { PublicGalleryItem } from '@/lib/types';
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
  dateLocale: string;
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
      className: 'border-gold/35 bg-raised/90 text-gold shadow-level-1',
      iconClassName: 'text-gold/90',
    };
  }

  return {
    label: 'Flash',
    icon: Zap,
    className: 'border-border bg-raised/90 text-ink-muted shadow-level-1',
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
  dateLocale,
}: GalleryCardProps) {
  const { t, locale } = useI18n();
  const author = getAuthorBadge(item.owner_username);
  const modeBadge = getModeBadgeConfig(item.mode);
  const ModeIcon = modeBadge.icon;
  const workspaceCtas = getGalleryWorkspaceCtas(locale, item);
  const generateHref = `/generate?source=gallery&entrypoint=gallery_reference_generation&gallery_review_id=${encodeURIComponent(item.review_id)}&image_type=${encodeURIComponent(item.image_type)}`;

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
      className="group flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface/85 shadow-level-1 transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-level-2 animate-slide-up"
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'both',
      }}
    >
      <div className="relative overflow-hidden px-3 pt-3">
        <GalleryCardImage item={item} alt={t('photo_thumbnail_alt')} />

        <div className="absolute inset-x-6 top-6 flex items-start justify-between gap-2">
          <div className="flex flex-col items-start gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium shadow-level-1 backdrop-blur-md transition-transform group-hover:scale-110 ${scoreTone(
                item.final_score
              )}`}
            >
              {item.final_score.toFixed(1)}
            </span>
            {item.recommended && (
              <span className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-gold shadow-level-1">
                {t('gallery_recommended')}
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] backdrop-blur-md ${modeBadge.className}`}
          >
            <ModeIcon size={11} strokeWidth={1.8} className={modeBadge.iconClassName} />
            {modeBadge.label}
          </span>
        </div>

        <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-full border border-border bg-raised/90 px-2.5 py-1.5 shadow-level-1 backdrop-blur-md">
          {item.owner_avatar_url ? (
            <Image
              src={item.owner_avatar_url}
              alt={author.label}
              width={28}
              height={28}
              className="h-7 w-7 rounded-full border border-border object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-action text-[11px] font-semibold text-action-ink">
              {author.initial}
            </span>
          )}
          <span className="max-w-[96px] truncate text-xs text-ink">{author.label}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <div className="rounded-control border border-border-subtle bg-raised/55 px-3.5 py-3">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_saved_at')}</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="mt-3 rounded-control border border-gold/20 bg-gold/5 px-3.5 py-3.5">
          <p
            className="text-xs leading-6 text-ink-muted"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {trimSummary(item.summary || t('gallery_summary_fallback'))}
          </p>
        </div>

        <div className="mt-3 grid gap-2">
          <Link
            href={workspaceCtas.practice.href}
            onClick={() => handleWorkspaceCtaClick(workspaceCtas.practice.entrypoint)}
            className="group/practice rounded-control border border-border-subtle bg-void/20 px-3.5 py-3 transition-colors hover:border-gold/30 hover:bg-gold/5"
          >
            <span className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-gold/80">
              <Camera size={12} />
              {workspaceCtas.practice.title}
            </span>
            <span className="mt-1.5 block text-xs leading-5 text-ink-muted">
              {workspaceCtas.practice.body}
            </span>
          </Link>
          <Link
            href={workspaceCtas.standard.href}
            onClick={() => handleWorkspaceCtaClick(workspaceCtas.standard.entrypoint)}
            className="ui-action-secondary px-3 py-2 text-xs active:scale-[0.98]"
          >
            <Gauge size={13} />
            {workspaceCtas.standard.cta}
          </Link>
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
            className="ui-action-secondary border-sage/30 px-3 py-2 text-xs text-sage hover:bg-sage/10 active:scale-[0.98]"
          >
            <Sparkles size={13} />
            {locale === 'zh' ? '生成同题材练习参考' : locale === 'ja' ? '同じ題材の参考を生成' : 'Generate practice reference'}
          </Link>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => void handleLikeToggle(item)}
            disabled={likeBusyId === item.review_id}
            className={`inline-flex min-h-11 min-w-[88px] items-center justify-center gap-2 rounded-control border px-3 py-2 text-sm transition-all active:scale-95 disabled:opacity-60 ${
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
            href={`/reviews/${item.review_id}?back=${encodeURIComponent(backHref)}`}
            onClick={() => persistGalleryState(item.review_id)}
            className="ui-action-primary flex-1 px-3 py-2 text-sm active:scale-[0.98]"
          >
            {t('gallery_open_review')}
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}

export default memo(GalleryCard);
