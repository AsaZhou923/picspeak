export interface RetakeModelLabelInput {
  result: {
    model_name?: string | null;
    scorer_model_name?: string | null;
    writer_model_name?: string | null;
    score_version?: string | null;
  };
}

function recognizeModelLabel(value: string): string | null {
  const normalized = value.toLowerCase();
  if (normalized.includes('gpt-6-sol')) return 'GPT-6 Sol';
  if (normalized.includes('gpt-6-luna')) return 'GPT-6 Luna';
  if (normalized.includes('gpt-6')) return 'GPT-6';
  if (normalized.includes('gpt-5.6')) return 'GPT-5.6';
  if (normalized.includes('gpt-5.5')) return 'GPT-5.5';
  return null;
}

export function getStoredRetakeModelLabel(review: RetakeModelLabelInput): string {
  const storedModelFields = [
    review.result.model_name,
    review.result.scorer_model_name,
    review.result.writer_model_name,
  ];

  for (const field of storedModelFields) {
    if (!field) continue;
    const label = recognizeModelLabel(field);
    if (label) return label;
  }

  const scoreVersion = (review.result.score_version ?? '').toLowerCase();
  if (scoreVersion === 'retake-paired-v2') return 'GPT-6';
  if (scoreVersion === 'retake-paired-v1') return 'GPT-5.6';
  return 'GPT';
}
