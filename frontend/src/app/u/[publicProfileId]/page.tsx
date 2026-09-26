'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, ArrowRight, Camera, GalleryHorizontal, Star } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { getProfileCopy } from '@/features/profile/profile-copy';
import { getPublicProfile, PublicProfileResponse } from '@/features/profile/api';
import { getImageTypeLabel } from '@/lib/review-history-copy';
import type { ImageType } from '@/lib/types';

function scoreTone(score: number): string {
  if (score >= 8) return 'text-sage border-sage/30 bg-sage/10';
  if (score >= 6) return 'text-gold border-gold/30 bg-gold/10';
  return 'text-rust border-rust/30 bg-rust/10';
}

export default function PublicProfilePage() {
  const params = useParams();
  const publicProfileId = String(params.publicProfileId || '');
  const { locale, t } = useI18n();
  const copy = useMemo(() => getProfileCopy(locale), [locale]);
  const [profile, setProfile] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    const controller = new AbortController();
    setLoading(true);
    setError('');

    getPublicProfile(publicProfileId, { signal: controller.signal })
      .then((payload) => {
        if (requestRef.current !== requestId) return;
        setProfile(payload);
        setLoading(false);
      })
      .catch((err) => {
        if (requestRef.current !== requestId || controller.signal.aborted) return;
        setProfile(null);
        setError(formatUserFacingError(t, err, copy.unavailable));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [copy.unavailable, publicProfileId, t]);

  const loadMore = useCallback(async () => {
    if (!profile?.next_cursor || loadingMore) return;
    setLoadingMore(true);
    setError('');
    try {
      const nextPage = await getPublicProfile(publicProfileId, { cursor: profile.next_cursor });
      setProfile((current) => {
        if (!current || current.public_profile_id !== nextPage.public_profile_id) return current;
        const existingIds = new Set(current.items.map((item) => item.review_id));
        const newItems = nextPage.items.filter((item) => !existingIds.has(item.review_id));
        return {
          ...nextPage,
          items: [...current.items, ...newItems],
        };
      });
    } catch (err) {
      setError(formatUserFacingError(t, err, copy.unavailable));
    } finally {
      setLoadingMore(false);
    }
  }, [copy.unavailable, loadingMore, profile?.next_cursor, publicProfileId, t]);

  if (loading) {
    return (
      <section className="min-h-screen px-6 py-12">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="h-36 rounded-card border border-border-subtle bg-surface/70" />
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-80 rounded-card border border-border-subtle bg-surface/70" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error || !profile) {
    return (
      <section className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <AlertCircle size={40} className="mx-auto text-rust" />
          <h1 className="mt-5 font-display text-3xl text-ink">{copy.unavailable}</h1>
          <p className="mt-3 text-sm leading-7 text-ink-muted">{error || copy.unavailable}</p>
          <Link href="/gallery" className="ui-action-secondary mt-6 inline-flex px-4 py-2">
            <GalleryHorizontal size={15} />
            {copy.backGallery}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-6xl animate-fade-in">
        <section className="overflow-hidden rounded-card border border-gold/20 bg-surface/85 shadow-level-1">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
            <div className="border-b border-border-subtle bg-void/25 p-6 lg:border-b-0 lg:border-r">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-accent-muted">
                <Camera size={13} />
                {copy.publicLabel}
              </p>
              <div className="flex items-center gap-4">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.username}
                    width={72}
                    height={72}
                    className="h-[72px] w-[72px] rounded-full border border-border object-cover"
                  />
                ) : (
                  <span className="flex h-[72px] w-[72px] items-center justify-center rounded-full border border-border bg-action text-2xl font-semibold text-action-ink">
                    {profile.username.charAt(0).toUpperCase()}
                  </span>
                )}
                <div>
                  <h1 className="font-display text-4xl text-ink sm:text-5xl">
                    {profile.username}
                    {copy.publicTitleSuffix}
                  </h1>
                  <p className="mt-2 text-sm text-ink-muted">
                    {profile.gallery_review_count}
                    {locale === 'en' ? ` ${copy.galleryCount}` : copy.galleryCount}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-control border border-border-subtle bg-raised/55 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{copy.galleryMetric}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{profile.gallery_review_count}</p>
                </div>
                <div className="rounded-control border border-border-subtle bg-raised/55 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{copy.visibleItems}</p>
                  <p className="mt-2 text-2xl font-semibold text-sage">{profile.items.length}</p>
                </div>
                <div className="rounded-control border border-border-subtle bg-raised/55 p-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-ink-subtle">{copy.interactions}</p>
                  <p className="mt-2 text-2xl font-semibold text-ink">{profile.total_like_count}</p>
                </div>
                <Link href="/gallery" className="rounded-control border border-gold/25 bg-gold/10 p-4 transition-colors hover:bg-gold/15">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-accent-muted">PicSpeak</p>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-gold">
                    {copy.backGallery}
                    <ArrowRight size={14} />
                  </p>
                </Link>
              </div>
            </div>
          </div>
        </section>

        {profile.items.length === 0 ? (
          <section className="mt-8 rounded-card border border-border-subtle bg-surface/80 p-10 text-center">
            <h2 className="font-display text-3xl text-ink">{copy.emptyTitle}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-ink-muted">{copy.emptyBody}</p>
          </section>
        ) : (
          <section className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {profile.items.map((item, index) => (
              <article
                key={item.review_id}
                className="group flex h-full flex-col overflow-hidden rounded-card border border-border-subtle bg-surface/85 shadow-level-1 transition-all duration-300 hover:-translate-y-1 hover:border-gold/30 hover:shadow-level-2 animate-slide-up"
                style={{ animationDelay: `${index * 45}ms`, animationFillMode: 'both' }}
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-void/40">
                  {item.photo_thumbnail_url || item.photo_url ? (
                    <Image
                      src={item.photo_thumbnail_url || item.photo_url || ''}
                      alt={item.summary || profile.username}
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-ink-subtle">
                      <Camera size={32} />
                    </div>
                  )}
                  <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium backdrop-blur-md ${scoreTone(item.final_score)}`}>
                      {item.final_score.toFixed(1)}
                    </span>
                    {item.recommended && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2.5 py-1 text-[11px] text-gold backdrop-blur-md">
                        <Star size={11} />
                        {copy.topBadge}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{getImageTypeLabel(locale, item.image_type as ImageType) || item.image_type}</p>
                  <p className="mt-3 text-sm leading-6 text-ink-muted">{item.summary}</p>
                  <Link
                    href={`/reviews/${item.review_id}?back=${encodeURIComponent(`/u/${profile.public_profile_id}`)}`}
                    className="ui-action-primary mt-auto px-3 py-2 text-sm"
                  >
                    {copy.openReview}
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            ))}
            {profile.next_cursor && (
              <div className="md:col-span-2 xl:col-span-3">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                  className="ui-action-secondary mx-auto px-5 py-3 disabled:opacity-60"
                >
                  {loadingMore ? copy.loadingMore : copy.loadMore}
                </button>
              </div>
            )}
          </section>
        )}
      </div>
    </section>
  );
}
