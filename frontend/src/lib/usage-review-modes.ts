import type { Translator } from './i18n';
import type { UsageResponse } from './types';

export function formatReviewModes(modes: UsageResponse['features']['review_modes'], t: Translator): string {
  return modes.map((mode) => mode === 'pro'
    ? `Pro · ${t('mode_pro_desc')}`
    : `Flash · ${t('mode_flash_desc')}`
  ).join(' / ');
}
