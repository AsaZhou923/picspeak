import { Locale, Translator } from '@/lib/i18n';
import { ReviewExportResponse, ReviewGetResponse, ReviewMetaResponse } from '@/lib/types';
import { getImageTypeLabelForLocale } from '@/lib/review-page-copy';

export type ReviewActionBusy = 'share' | 'export' | 'replay' | 'favorite' | 'gallery' | null;

type ExportSummaryCopy = {
  title: string;
  exportedAt: string;
  createdAt: string;
  reviewInfo: string;
  reviewId: string;
  mode: string;
  imageType: string;
  model: string;
  scoreSummary: string;
  favorite: string;
  yes: string;
  no: string;
  sourceReviewId: string;
  tags: string;
  note: string;
  scores: string;
  strengths: string;
  issues: string;
  suggestions: string;
  photoInfo: string;
  photoId: string;
  filePrefix: string;
};

export function mergeReviewMeta(review: ReviewGetResponse | null, payload: ReviewMetaResponse): ReviewGetResponse | null {
  if (!review) return review;
  return {
    ...review,
    favorite: payload.favorite,
    gallery_visible: payload.gallery_visible,
    gallery_audit_status: payload.gallery_audit_status,
    gallery_added_at: payload.gallery_added_at,
    gallery_rejected_reason: payload.gallery_rejected_reason,
    tags: payload.tags,
    note: payload.note,
  };
}

export function buildReviewExportMarkdown(args: {
  payload: ReviewExportResponse;
  locale: Locale;
  t: Translator;
  exportSummaryCopy: ExportSummaryCopy;
}): string {
  const { payload, locale, t, exportSummaryCopy } = args;
  const lines = [
    `# ${exportSummaryCopy.title}`,
    '',
    `- ${exportSummaryCopy.exportedAt}: ${new Date(payload.review.exported_at).toLocaleString(locale)}`,
    `- ${exportSummaryCopy.createdAt}: ${new Date(payload.review.created_at).toLocaleString(locale)}`,
    '',
    `## ${exportSummaryCopy.reviewInfo}`,
    `- ${exportSummaryCopy.reviewId}: ${payload.review.review_id}`,
    `- ${exportSummaryCopy.mode}: ${payload.review.mode === 'pro' ? 'Pro' : 'Flash'}`,
    `- ${exportSummaryCopy.imageType}: ${getImageTypeLabelForLocale(locale, payload.review.image_type)}`,
    `- ${exportSummaryCopy.model}: ${payload.review.model_name}${payload.review.model_version ? ` (${payload.review.model_version})` : ''}`,
    `- ${exportSummaryCopy.scoreSummary}: ${payload.review.final_score.toFixed(1)} / 10`,
    `- ${exportSummaryCopy.favorite}: ${payload.review.favorite ? exportSummaryCopy.yes : exportSummaryCopy.no}`,
  ];

  if (payload.review.source_review_id) {
    lines.push(`- ${exportSummaryCopy.sourceReviewId}: ${payload.review.source_review_id}`);
  }
  if (payload.review.tags.length > 0) {
    lines.push(`- ${exportSummaryCopy.tags}: ${payload.review.tags.join(' / ')}`);
  }
  if (payload.review.note) {
    lines.push(`- ${exportSummaryCopy.note}: ${payload.review.note}`);
  }

  lines.push(
    '',
    `## ${exportSummaryCopy.scores}`,
    `- ${t('score_composition')}: ${payload.review.scores.composition.toFixed(1)}`,
    `- ${t('score_lighting')}: ${payload.review.scores.lighting.toFixed(1)}`,
    `- ${t('score_color')}: ${payload.review.scores.color.toFixed(1)}`,
    `- ${t('score_impact')}: ${payload.review.scores.impact.toFixed(1)}`,
    `- ${t('score_technical')}: ${payload.review.scores.technical.toFixed(1)}`,
    '',
    `## ${exportSummaryCopy.strengths}`,
    payload.review.advantage || '-',
    '',
    `## ${exportSummaryCopy.issues}`,
    payload.review.critique || '-',
    '',
    `## ${exportSummaryCopy.suggestions}`,
    payload.review.suggestions || '-',
    '',
    `## ${exportSummaryCopy.photoInfo}`,
    `- ${exportSummaryCopy.photoId}: ${payload.photo.photo_id}`
  );

  return lines.join('\n');
}
