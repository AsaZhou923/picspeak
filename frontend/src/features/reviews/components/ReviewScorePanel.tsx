/* eslint-disable @next/next/no-img-element -- Review preview uses client-side cached object URLs */
import { TrendingDown, ZoomIn } from 'lucide-react';
import type { ReviewGetResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import {
  DIM_TO_TAGS,
  formatExposureValue,
  getDimColorClass,
  getDimDescByType,
  getDimTextClass,
} from '@/lib/review-page-copy';

interface ReviewPhotoPanelProps {
  photoUrl: string | null;
  photoError: boolean;
  onImgLoad: (size: { w: number; h: number }) => void;
  onPhotoError: () => void;
  onZoomOpen: () => void;
}

interface ReviewScorePanelProps {
  review: ReviewGetResponse;
  activeDim: string | null;
  onDimClick: (dimKey: string) => void;
}

interface ReviewMetadataPanelProps {
  review: ReviewGetResponse;
  imgNaturalSize: { w: number; h: number } | null;
}

export function ReviewPhotoPanel({
  photoUrl,
  photoError,
  onImgLoad,
  onPhotoError,
  onZoomOpen,
}: ReviewPhotoPanelProps) {
  const { t } = useI18n();

  return (
    <div className="overflow-hidden rounded-feature border border-border-subtle bg-raised shadow-level-2">
      {photoUrl && !photoError ? (
        <button
          type="button"
          onClick={onZoomOpen}
          aria-label={t('img_zoom_label')}
          className="photo-frame group relative block w-full cursor-zoom-in overflow-hidden text-left"
        >
          <img
            src={photoUrl}
            alt={t('review_photo_alt')}
            className="max-h-[72vh] h-auto w-full max-w-full object-contain"
            onError={() => { void onPhotoError(); }}
            onLoad={(event) => {
              const img = event.currentTarget;
              onImgLoad({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            loading="eager"
            decoding="async"
          />
          <span className="absolute inset-0 flex items-center justify-center bg-void/35 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <span className="flex min-h-11 items-center gap-2 rounded-control border border-white/30 bg-black/55 px-4 py-2 text-sm font-medium text-white shadow-level-1">
              <ZoomIn size={18} aria-hidden="true" />
              {t('img_zoom_label')}
            </span>
          </span>
        </button>
      ) : (
        <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-ink-subtle">
          {t('review_no_image')}
        </div>
      )}
    </div>
  );
}

export function ReviewScorePanel({
  review,
  activeDim,
  onDimClick,
}: ReviewScorePanelProps) {
  const { t, locale } = useI18n();
  const resultImageType = review.result?.image_type ?? 'default';
  const weakestKey = Object.entries(review.result.scores as unknown as Record<string, number>).reduce(
    (min, [key, value]) => (value < min[1] ? [key, value] : min),
    ['', Infinity]
  )[0];
  const scoreDims = [
    { key: 'composition', label: t('score_composition'), desc: getDimDescByType(locale, resultImageType, 'composition') },
    { key: 'lighting', label: t('score_lighting'), desc: getDimDescByType(locale, resultImageType, 'lighting') },
    { key: 'color', label: t('score_color'), desc: getDimDescByType(locale, resultImageType, 'color') },
    { key: 'impact', label: t('score_impact'), desc: getDimDescByType(locale, resultImageType, 'impact') },
    { key: 'technical', label: t('score_technical'), desc: getDimDescByType(locale, resultImageType, 'technical') },
  ];

  return (
    <section className="ui-panel p-5" aria-labelledby="review-score-panel-title">
      <div className="mb-4">
        <h2 id="review-score-panel-title" className="text-lg font-semibold text-ink">
          {t('review_score_dims_basis')}
        </h2>
      </div>
      <div className="space-y-2">
        {scoreDims.map((dimension) => {
          const score = (review.result.scores as unknown as Record<string, number>)[dimension.key] ?? 0;
          const isWeakest = dimension.key === weakestKey;
          const isActive = activeDim === dimension.key;
          const hasTarget = (DIM_TO_TAGS[dimension.key]?.length ?? 0) > 0;
          const descriptionId = `review-dimension-${dimension.key}-description`;
          const rowContent = (
            <>
              <span className="flex items-center gap-2.5">
                <span className={`w-20 shrink-0 text-xs ${isWeakest ? 'text-rust' : isActive ? 'text-gold' : 'text-ink-muted'}`}>
                  {dimension.label}
                </span>
                <span
                  role="meter"
                  aria-label={`${dimension.label}: ${score.toFixed(1)}`}
                  aria-valuemin={0}
                  aria-valuemax={10}
                  aria-valuenow={score}
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-void/50"
                >
                  <span
                    className={`block h-full rounded-full transition-all duration-700 ${getDimColorClass(score)}`}
                    style={{ width: `${score * 10}%` }}
                  />
                </span>
                <span className={`w-8 shrink-0 text-right font-mono text-xs ${getDimTextClass(score)}`}>
                  {score.toFixed(1)}
                </span>
                {isWeakest && <TrendingDown size={12} className="shrink-0 text-rust" aria-label={t('review_score_lowest')} />}
                {hasTarget && (
                  <span className="shrink-0 text-xs text-gold" aria-hidden="true">↓</span>
                )}
              </span>
              <span
                id={descriptionId}
                className={`mt-2 text-left text-xs leading-5 text-ink-muted ${hasTarget ? 'hidden group-hover:block group-focus-within:block' : 'block'}`}
              >
                {dimension.desc}
                {hasTarget && (
                  <span className="mt-1 block border-t border-border-subtle pt-1 text-gold">
                    <span aria-hidden="true">↓ </span>{t('dim_click_hint')}
                  </span>
                )}
              </span>
            </>
          );

          if (!hasTarget) {
            return (
              <div key={dimension.key} className="rounded-control px-3 py-2.5">
                {rowContent}
              </div>
            );
          }

          return (
            <button
              key={dimension.key}
              type="button"
              onClick={() => onDimClick(dimension.key)}
              aria-describedby={descriptionId}
              aria-pressed={isActive}
              className={`group min-h-11 w-full rounded-control px-3 py-2.5 transition-colors ${isActive ? 'bg-gold/10' : 'hover:bg-raised'}`}
            >
              {rowContent}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function ReviewMetadataPanel({ review, imgNaturalSize }: ReviewMetadataPanelProps) {
  const { t, locale } = useI18n();
  const rows = getExifRows(review, t);

  return (
    <section className="ui-panel p-5" aria-labelledby="review-metadata-title">
      <h2 id="review-metadata-title" className="text-lg font-semibold text-ink">{t('review_exif_params')}</h2>
      <div className="mt-3 space-y-1 font-mono text-xs text-ink-subtle">
        <p>{new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}</p>
        {imgNaturalSize && (
          <p>{t('review_img_resolution')}: {imgNaturalSize.w} × {imgNaturalSize.h}</p>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 grid gap-2 border-t border-border-subtle pt-4 text-xs sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="font-mono text-ink-subtle">{label}</dt>
              <dd className="mt-0.5 truncate font-mono text-ink-muted">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function getExifRows(
  review: ReviewGetResponse,
  t: ReturnType<typeof useI18n>['t']
): [string, string][] {
  if (!review.exif_data) return [];

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
  const aperture = typeof fNumber === 'number' && fNumber > 0
    ? `f/${fNumber % 1 === 0 ? fNumber : fNumber.toFixed(1)}`
    : '';
  const shutter = formatExposureValue(exif.ExposureTime);
  const iso = typeof exif.ISO === 'number' && exif.ISO > 0 ? String(exif.ISO) : '';

  return [
    [t('review_exif_camera'), camera],
    [t('review_exif_lens'), lens],
    [t('review_exif_focal'), focal],
    [t('review_exif_aperture'), aperture],
    [t('review_exif_shutter'), shutter],
    [t('review_exif_iso'), iso],
  ].filter(([, value]) => value) as [string, string][];
}
