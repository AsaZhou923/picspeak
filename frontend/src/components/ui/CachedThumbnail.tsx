'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { getReviewThumbnailSrc } from '@/lib/review-thumbnail-cache';

interface CachedThumbnailProps {
  photoId: string;
  photoUrl: string | null;
  fallbackUrl?: string | null;
  alt: string;
  size?: number;
  sourceIsThumbnail?: boolean;
  containerClassName?: string;
  imageClassName?: string;
}

export default function CachedThumbnail({
  photoId,
  photoUrl,
  fallbackUrl = null,
  alt,
  size = 64,
  sourceIsThumbnail = false,
  containerClassName = '',
  imageClassName = '',
}: CachedThumbnailProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSrc(null);
    setLoadFailed(false);
    setFallbackFailed(false);
    setShouldLoad(false);
  }, [photoId, photoUrl, fallbackUrl]);

  useEffect(() => {
    if (!photoUrl || shouldLoad) {
      return;
    }

    const node = containerRef.current;
    if (!node || !('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      { rootMargin: '240px 0px' }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [photoUrl, shouldLoad]);

  useEffect(() => {
    let cancelled = false;
    if (!photoUrl || !shouldLoad || loadFailed) {
      return;
    }

    getReviewThumbnailSrc(
      photoId,
      photoUrl,
      Math.max(size * 2, 96),
      sourceIsThumbnail
    ).then((nextSrc) => {
      if (cancelled) {
        return;
      }

      if (!nextSrc) {
        setLoadFailed(true);
        return;
      }

      setSrc(nextSrc);
    });

    return () => {
      cancelled = true;
    };
  }, [loadFailed, photoId, photoUrl, shouldLoad, size, sourceIsThumbnail]);

  const fallbackSrc = fallbackUrl ?? photoUrl;
  const displaySrc = src ?? (loadFailed && !fallbackFailed ? fallbackSrc : null);

  return (
    <div
      ref={containerRef}
      className={`shrink-0 w-16 h-16 rounded overflow-hidden bg-void border border-border-subtle flex items-center justify-center ${containerClassName}`.trim()}
    >
      {displaySrc ? (
        <img
          src={displaySrc}
          alt={alt}
          width={size}
          height={size}
          className={`w-full h-full object-cover ${imageClassName}`.trim()}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (!loadFailed) {
              setLoadFailed(true);
              return;
            }
            setFallbackFailed(true);
          }}
        />
      ) : (photoUrl || fallbackUrl) ? (
        <div className="h-full w-full animate-pulse bg-border-subtle/40" aria-hidden="true" />
      ) : (
        <ImageOff size={20} className="text-ink-subtle" />
      )}
    </div>
  );
}
