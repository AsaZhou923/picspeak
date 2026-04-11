'use client';

import { useEffect, useState } from 'react';
import { PublicGalleryItem } from '@/lib/types';

export default function GalleryCardImage({
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
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[22px] border border-border-subtle bg-[radial-gradient(circle_at_top,rgba(200,162,104,0.14),transparent_40%),linear-gradient(180deg,rgba(248,244,237,0.92),rgba(228,221,211,0.82))] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] dark:border-[rgba(208,186,146,0.14)] dark:bg-[radial-gradient(circle_at_top,rgba(239,225,198,0.24),transparent_38%),linear-gradient(180deg,rgba(20,18,16,0.08),rgba(11,10,9,0.26))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
          <div className="absolute inset-x-4 top-4 bottom-6 flex items-center justify-center overflow-hidden rounded-[28px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.54),rgba(244,238,229,0.24))] shadow-[0_18px_44px_rgba(120,96,68,0.14)] backdrop-blur-[3px] dark:border-[rgba(208,186,146,0.12)] dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] dark:shadow-[0_20px_54px_rgba(0,0,0,0.34)]">
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
        <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(145deg,rgba(244,239,231,0.96),rgba(227,219,208,0.94))] px-6 text-center text-sm leading-6 text-ink-subtle dark:bg-[linear-gradient(145deg,rgba(33,30,26,0.92),rgba(17,15,13,0.96))]">
          {alt}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.32),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0)_56%,rgba(250,248,244,0.86))] dark:bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.08),transparent_32%),linear-gradient(180deg,rgba(12,11,10,0.04),rgba(12,11,10,0.16)_55%,rgba(12,11,10,0.88))]" />
    </div>
  );
}
