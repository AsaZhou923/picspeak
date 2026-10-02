import type { TranslationKey } from './i18n-zh';

const EVIDENCE_RUBRIC_SCORE_VERSIONS = new Set([
  'score-v5-evidence-calibrated',
  'photo-score-v5-evidence-calibrated',
  'score-v6-evidence-independent',
  'photo-score-v6-evidence-independent',
  'score-v7-canonical-quality',
  'photo-score-v7-canonical-quality',
]);

function isEvidenceRubricScoreVersion(scoreVersion?: string | null): boolean {
  const normalized = scoreVersion?.trim().toLowerCase();
  return normalized ? EVIDENCE_RUBRIC_SCORE_VERSIONS.has(normalized) : false;
}

function scoreBucket(score: number, scoreVersion?: string | null): number {
  const rawBucket = isEvidenceRubricScoreVersion(scoreVersion) ? Math.floor(score) : Math.round(score);
  return Math.max(1, Math.min(10, rawBucket));
}

export function getDimColorClass(score: number, scoreVersion?: string | null): string {
  const highThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'bg-sage';
  if (score >= basicThreshold) return 'bg-gold';
  return 'bg-rust';
}

export function getDimTextClass(score: number, scoreVersion?: string | null): string {
  const highThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'text-sage';
  if (score >= basicThreshold) return 'text-gold';
  return 'text-rust';
}

export function getScoreLabelColor(score: number, scoreVersion?: string | null): string {
  const highThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isEvidenceRubricScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'text-sage';
  if (score >= basicThreshold) return 'text-gold';
  return 'text-rust';
}

export function getScoreLabelKey(score: number, scoreVersion?: string | null): TranslationKey {
  return `score_label_${scoreBucket(score, scoreVersion)}` as TranslationKey;
}
