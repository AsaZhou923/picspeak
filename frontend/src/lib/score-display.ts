import type { TranslationKey } from './i18n-zh';

const V5_SCORE_VERSION = 'score-v5-evidence-calibrated';

function isV5ScoreVersion(scoreVersion?: string | null): boolean {
  return scoreVersion?.trim() === V5_SCORE_VERSION;
}

function scoreBucket(score: number, scoreVersion?: string | null): number {
  const rawBucket = isV5ScoreVersion(scoreVersion) ? Math.floor(score) : Math.round(score);
  return Math.max(1, Math.min(10, rawBucket));
}

export function getDimColorClass(score: number, scoreVersion?: string | null): string {
  const highThreshold = isV5ScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isV5ScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'bg-sage';
  if (score >= basicThreshold) return 'bg-gold';
  return 'bg-rust';
}

export function getDimTextClass(score: number, scoreVersion?: string | null): string {
  const highThreshold = isV5ScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isV5ScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'text-sage';
  if (score >= basicThreshold) return 'text-gold';
  return 'text-rust';
}

export function getScoreLabelColor(score: number, scoreVersion?: string | null): string {
  const highThreshold = isV5ScoreVersion(scoreVersion) ? 8 : 7.5;
  const basicThreshold = isV5ScoreVersion(scoreVersion) ? 5 : 5.5;
  if (score >= highThreshold) return 'text-sage';
  if (score >= basicThreshold) return 'text-gold';
  return 'text-rust';
}

export function getScoreLabelKey(score: number, scoreVersion?: string | null): TranslationKey {
  return `score_label_${scoreBucket(score, scoreVersion)}` as TranslationKey;
}
