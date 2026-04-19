/* eslint-disable @next/next/no-img-element -- Review preview uses client-side cached object URLs */
import { TrendingDown, ZoomIn } from 'lucide-react';
import { ReviewGetResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import {
  DIM_TO_TAGS,
  formatExposureValue,
  getDimColorClass,
  getDimDescByType,
  getDimTextClass,
} from '@/lib/review-page-copy';

interface ReviewScorePanelProps {
  review: ReviewGetResponse;
  photoUrl: string | null;
  photoError: boolean;
  imgNaturalSize: { w: number; h: number } | null;
  activeDim: string | null;
  onImgLoad: (size: { w: number; h: number }) => void;
  onPhotoError: () => void;
  onZoomOpen: () => void;
  onDimClick: (dimKey: string) => void;
}

export function ReviewScorePanel({
  review,
  photoUrl,
  photoError,
  imgNaturalSize,
  activeDim,
  onImgLoad,
  onPhotoError,
  onZoomOpen,
  onDimClick,
}: ReviewScorePanelProps) {
  const { t, locale } = useI18n();
  const resultImageType = review.result?.image_type ?? 'default';
  const weakestKey = Object.entries(review.result.scores as unknown as Record<string, number>).reduce(
    (min, [k, v]) => (v < min[1] ? [k, v] : min),
    ['', Infinity]
  )[0];

  const scoreDims = [
    { key: 'composition', label: t('score_composition'), desc: getDimDescByType(locale, resultImageType, 'composition') },
    { key: 'lighting',    label: t('score_lighting'),    desc: getDimDescByType(locale, resultImageType, 'lighting') },
    { key: 'color',       label: t('score_color'),       desc: getDimDescByType(locale, resultImageType, 'color') },
    { key: 'impact',      label: t('score_impact'),      desc: getDimDescByType(locale, resultImageType, 'impact') },
    { key: 'technical',   label: t('score_technical'),   desc: getDimDescByType(locale, resultImageType, 'technical') },
  ];

  return (
    <div className="lg:sticky lg:top-20 min-w-0">
      <div className="rounded-xl overflow-hidden border border-border-subtle bg-raised">
        {photoUrl && !photoError ? (
          <div
            className="photo-frame relative cursor-zoom-in group"
            onClick={onZoomOpen}
            title={t('img_zoom_label')}
          >
            <img
              src={photoUrl}
              alt={t('review_photo_alt')}
              className="w-full max-w-full h-auto object-contain max-h-[65vh]"
              onError={() => { void onPhotoError(); }}
              onLoad={(e) => {
                const img = e.currentTarget;
                onImgLoad({ w: img.naturalWidth, h: img.naturalHeight });
              }}
              loading="eager"
              decoding="async"
            />
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-void/30">
              <ZoomIn size={32} className="text-white drop-shadow-lg" />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-64 text-ink-subtle text-sm">
            {t('review_no_image')}
          </div>
        )}

        <div className="border-t border-border-subtle px-5 py-4 space-y-2">
          {scoreDims.map((d) => {
            const score = (review.result.scores as unknown as Record<string, number>)[d.key] ?? 0;
            const isWeakest = d.key === weakestKey;
            const isActive = activeDim === d.key;
            const hasTarget = (DIM_TO_TAGS[d.key]?.length ?? 0) > 0;
            return (
              <div
                key={d.key}
                className={`group/dim relative rounded px-1 -mx-1 py-0.5 transition-colors ${hasTarget ? 'cursor-pointer' : ''} ${isActive ? 'bg-gold/10' : hasTarget ? 'hover:bg-void/30' : ''}`}
                onClick={() => onDimClick(d.key)}
              >
                <div className="flex items-center gap-2.5">
                  <span className={`text-xs w-16 shrink-0 ${isWeakest ? 'text-rust' : isActive ? 'text-gold' : 'text-ink-muted'}`}>
                    {d.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-void/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${getDimColorClass(score)}`}
                      style={{ width: `${score * 10}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono w-7 text-right shrink-0 ${getDimTextClass(score)}`}>
                    {score.toFixed(1)}
                  </span>
                  {isWeakest && <TrendingDown size={10} className="text-rust shrink-0" />}
                  {hasTarget && (
                    <span className="text-[10px] text-gold/0 group-hover/dim:text-gold/50 transition-colors shrink-0 select-none" aria-hidden>↓</span>
                  )}
                </div>
                <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-10 hidden group-hover/dim:block w-60 rounded-md bg-surface border border-border-subtle px-3 py-2 shadow-lg">
                  <p className="text-[11px] text-ink-muted leading-relaxed">{d.desc}</p>
                  {hasTarget && (
                    <p className="text-[10px] text-gold/70 mt-1.5 pt-1.5 border-t border-border-subtle flex items-center gap-1">
                      <span aria-hidden>↓</span>
                      {t('dim_click_hint')}
                    </p>
                  )}
                  <div className="absolute left-4 top-full w-2 h-2 overflow-hidden">
                    <div className="w-2 h-2 bg-surface border-r border-b border-border-subtle rotate-45 -translate-y-1" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-border-subtle px-5 py-2.5 space-y-0.5">
          <p className="text-xs text-ink-subtle font-mono">
            {new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}
          </p>
          {imgNaturalSize && (
            <p className="text-xs text-ink-subtle font-mono">
              {t('review_img_resolution')}: {imgNaturalSize.w} × {imgNaturalSize.h}
            </p>
          )}
          {review.exif_data && (() => {
            const exif = review.exif_data;
            const make = typeof exif.Make === 'string' ? exif.Make.trim() : '';
            const model = typeof exif.Model === 'string' ? exif.Model.trim() : '';
            const camera = model.startsWith(make) || !make ? model : `${make} ${model}`;
            const lens = typeof exif.LensModel === 'string' ? exif.LensModel.trim() : '';
            const focalRaw = exif.FocalLength;
            const focal35 = exif.FocalLengthIn35mm;
            const focal = typeof focalRaw === 'number' && focalRaw > 0
              ? `${focalRaw % 1 === 0 ? focalRaw : focalRaw.toFixed(1)} mm${typeof focal35 === 'number' && focal35 > 0 && focal35 !== focalRaw ? ` (35mm: ${focal35} mm)` : ''}`
              : '';
            const fNumber = exif.FNumber;
            const aperture = typeof fNumber === 'number' && fNumber > 0 ? `f/${fNumber % 1 === 0 ? fNumber : fNumber.toFixed(1)}` : '';
            const shutter = formatExposureValue(exif.ExposureTime);
            const iso = typeof exif.ISO === 'number' && exif.ISO > 0 ? String(exif.ISO) : '';
            const rows: [string, string][] = [
              [t('review_exif_camera'), camera],
              [t('review_exif_lens'), lens],
              [t('review_exif_focal'), focal],
              [t('review_exif_aperture'), aperture],
              [t('review_exif_shutter'), shutter],
              [t('review_exif_iso'), iso],
            ].filter(([, v]) => v) as [string, string][];
            if (rows.length === 0) return null;
            return (
              <div className="pt-1.5 mt-0.5 border-t border-border-subtle/50 space-y-0.5">
                <p className="text-[10px] text-ink-muted uppercase tracking-widest font-mono mb-1">{t('review_exif_params')}</p>
                {rows.map(([label, value]) => (
                  <p key={label} className="text-xs text-ink-subtle font-mono truncate">
                    <span className="text-ink-muted">{label}: </span>{value}
                  </p>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
