'use client';

import Link from 'next/link';
import { ChevronRight, Heart, Star, Zap } from 'lucide-react';
import { PublicGalleryItem } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
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
      className:
        'border-gold/35 bg-[linear-gradient(135deg,rgba(200,162,104,0.24),rgba(58,40,18,0.78))] text-gold shadow-[0_10px_30px_rgba(200,162,104,0.18)]',
      iconClassName: 'text-gold/90',
    };
  }

  return {
    label: 'Flash',
    icon: Zap,
    className:
      'border-white/12 bg-[linear-gradient(135deg,rgba(241,237,230,0.14),rgba(22,22,24,0.78))] text-white/72 shadow-[0_10px_30px_rgba(0,0,0,0.18)]',
    iconClassName: 'text-white/60',
  };
}

export default function GalleryCard({
  item,
  index,
  likeBusyId,
  handleLikeToggle,
  persistGalleryState,
  backHref,
  dateLocale,
}: GalleryCardProps) {
  const { t } = useI18n();
  const author = getAuthorBadge(item.owner_username);
  const modeBadge = getModeBadgeConfig(item.mode);
  const ModeIcon = modeBadge.icon;

  return (
    <article
      data-review-id={item.review_id}
      className="group flex h-full flex-col overflow-hidden rounded-[26px] border border-border-subtle bg-[linear-gradient(180deg,rgba(248,244,238,0.96),rgba(236,230,221,0.98))] shadow-[0_18px_48px_rgba(146,120,88,0.12)] transition-all duration-500 hover:-translate-y-2 hover:border-gold/30 hover:shadow-[0_32px_80px_rgba(146,120,88,0.22)] dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(31,28,24,0.94),rgba(18,17,15,0.98))] dark:shadow-[0_18px_48px_rgba(0,0,0,0.18)] dark:hover:shadow-[0_28px_72px_rgba(0,0,0,0.28)] animate-slide-up"
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
              className={`rounded-full border px-2.5 py-1 text-xs font-medium shadow-[0_8px_30px_rgba(0,0,0,0.22)] backdrop-blur-md transition-transform group-hover:scale-110 ${scoreTone(
                item.final_score
              )}`}
            >
              {item.final_score.toFixed(1)}
            </span>
            {item.recommended && (
              <span className="rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-gold shadow-[0_10px_26px_rgba(200,162,104,0.14)]">
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

        <div className="absolute bottom-6 right-6 flex items-center gap-2 rounded-full border border-border bg-[rgba(250,248,244,0.92)] px-2.5 py-1.5 shadow-[0_12px_30px_rgba(120,96,68,0.14)] backdrop-blur-md dark:border-white/10 dark:bg-[rgba(241,237,230,0.9)] dark:shadow-[0_12px_36px_rgba(0,0,0,0.2)]">
          {item.owner_avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={item.owner_avatar_url}
              alt={author.label}
              loading="lazy"
              decoding="async"
              className="h-7 w-7 rounded-full border border-white/45 object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[linear-gradient(135deg,rgba(224,186,136,0.95),rgba(138,110,67,0.95))] text-[11px] font-semibold text-white dark:text-void">
              {author.initial}
            </span>
          )}
          <span className="max-w-[96px] truncate text-xs text-ink dark:text-void">{author.label}</span>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
        <div className="rounded-[20px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.45),rgba(245,239,231,0.2))] px-3.5 py-3 dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.01))]">
          <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{t('gallery_saved_at')}</p>
          <p className="mt-2 text-sm font-medium text-ink">
            {new Date(item.gallery_added_at).toLocaleDateString(dateLocale, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </p>
        </div>

        <div className="mt-3 rounded-[20px] border border-[rgba(200,162,104,0.16)] bg-[linear-gradient(180deg,rgba(200,162,104,0.08),rgba(255,255,255,0.14))] px-3.5 py-3.5 dark:border-[rgba(200,162,104,0.1)] dark:bg-[linear-gradient(180deg,rgba(200,162,104,0.05),rgba(255,255,255,0.02))]">
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

        <div className="mt-auto flex items-center gap-2 pt-4">
          <button
            type="button"
            onClick={() => void handleLikeToggle(item)}
            disabled={likeBusyId === item.review_id}
            className={`inline-flex min-w-[88px] items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm transition-all active:scale-95 disabled:opacity-60 ${
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
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-gold/30 px-3 py-2 text-sm text-gold transition-all hover:bg-gold/10 active:scale-[0.98]"
          >
            {t('gallery_open_review')}
            <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
