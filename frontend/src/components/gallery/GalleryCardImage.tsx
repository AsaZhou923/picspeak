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
    <div className={`relative w-full overflow-hidden bg-raised ${compact ? 'aspect-[4/3]' : 'min-h-40'}`}>
      {!broken && src ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={`block w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04] ${compact ? 'h-full' : 'h-auto max-h-[34rem]'}`}
          onError={handleError}
        />
      ) : (
        <div className="flex min-h-40 w-full items-center justify-center bg-surface px-6 text-center text-sm leading-6 text-ink-subtle">
          {alt}
        </div>
      )}
    </div>
  );
}

export default memo(GalleryCardImage);
