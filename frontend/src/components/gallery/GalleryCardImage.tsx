'use client';

import { memo, useEffect, useState } from 'react';
import { PublicGalleryItem } from '@/lib/types';

function GalleryCardImage({
  item,
  alt,
}: {
  item: PublicGalleryItem;
  alt: string;
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
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card border border-border-subtle bg-raised shadow-level-1">
      {!broken && src ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-[26px] saturate-[0.85] transition-transform duration-1000 group-hover:scale-[1.2] dark:opacity-45"
          />
          <div className="absolute inset-x-4 bottom-6 top-4 flex items-center justify-center overflow-hidden rounded-card border border-border bg-surface/70 shadow-level-1 backdrop-blur-[3px]">
            <div className="relative h-full w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-contain px-3 py-4 transition-transform duration-700 group-hover:scale-[1.05]"
                onError={handleError}
              />
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-surface px-6 text-center text-sm leading-6 text-ink-subtle">
          {alt}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-void/75" />
    </div>
  );
}

export default memo(GalleryCardImage);
