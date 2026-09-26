'use client';

import { memo, useEffect, useState } from 'react';
import type { PublicGalleryItem } from '@/lib/gallery-ux-types';

function GalleryCardImage({
  item,
  alt,
  compact = false,
}: {
  item: PublicGalleryItem;
  alt: string;
  compact?: boolean;
}) {
  // Signed proxy URLs are more reliable here when rendered directly than through Next image optimization.
  const primarySrc = item.photo_thumbnail_url || item.photo_url || '';
  const fallbackSrc = item.photo_url || '';
  const [src, setSrc] = useState(primarySrc);
  const [broken, setBroken] = useState(!primarySrc);

  useEffect(() => {
    setSrc(primarySrc);
    setBroken(!primarySrc);
  }, [primarySrc]);

  const handleError = () => {
    if (fallbackSrc && src !== fallbackSrc) {
      setSrc(fallbackSrc);
      return;
    }
    setBroken(true);
  };

  return (
    <div className={`relative flex w-full items-center justify-center overflow-hidden rounded-t-card bg-void/35 ${compact ? 'min-h-48 sm:aspect-[5/4] sm:min-h-0' : 'min-h-56 sm:aspect-[4/3] sm:min-h-0'}`}>
      {!broken && src ? (
        <div className="w-full sm:h-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            loading="lazy"
            decoding="async"
            className={`w-full object-contain transition-transform duration-700 group-hover:scale-[1.015] ${compact ? 'h-48 p-1 sm:h-full' : 'h-auto max-h-[36rem] p-1.5 sm:h-full sm:max-h-none'}`}
            onError={handleError}
          />
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface px-6 text-center text-sm leading-6 text-ink-subtle">
          {alt}
        </div>
      )}
    </div>
  );
}

export default memo(GalleryCardImage);
