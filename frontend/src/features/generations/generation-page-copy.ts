import { localeToIntlLocale } from '@/lib/locale';
import type { Locale, TranslationKey } from '@/lib/i18n';
import type { GenerationQuality, GenerationSize } from '@/lib/types';

export const STYLE_OPTIONS = [
  { value: 'none', labelKey: 'generation_style_none' },
  { value: 'realistic', labelKey: 'generation_style_realistic' },
  { value: 'editorial', labelKey: 'generation_style_editorial' },
  { value: 'cinematic', labelKey: 'generation_style_cinematic' },
  { value: 'minimal', labelKey: 'generation_style_minimal' },
  { value: 'illustration', labelKey: 'generation_style_illustration' },
] as const satisfies ReadonlyArray<{ value: string; labelKey: TranslationKey }>;

export const TEMPLATE_COPY_KEYS = {
  custom_creation: {
    label: 'generation_template_custom_label',
    description: 'generation_template_custom_description',
    prompt: 'generation_template_custom_prompt',
  },
  photo_inspiration: {
    label: 'generation_template_photo_label',
    description: 'generation_template_photo_description',
    prompt: 'generation_template_photo_prompt',
  },
  social_visual: {
    label: 'generation_template_social_label',
    description: 'generation_template_social_description',
    prompt: 'generation_template_social_prompt',
  },
  portrait_avatar: {
    label: 'generation_template_portrait_label',
    description: 'generation_template_portrait_description',
    prompt: 'generation_template_portrait_prompt',
  },
  product_scene: {
    label: 'generation_template_product_label',
    description: 'generation_template_product_description',
    prompt: 'generation_template_product_prompt',
  },
  interior_atmosphere: {
    label: 'generation_template_interior_label',
    description: 'generation_template_interior_description',
    prompt: 'generation_template_interior_prompt',
  },
  color_moodboard: {
    label: 'generation_template_moodboard_label',
    description: 'generation_template_moodboard_description',
    prompt: 'generation_template_moodboard_prompt',
  },
} as const satisfies Record<string, Record<'label' | 'description' | 'prompt', TranslationKey>>;

export const QUALITY_COPY_KEYS = {
  low: { label: 'generation_quality_low', detail: 'generation_quality_low_detail' },
  medium: { label: 'generation_quality_medium', detail: 'generation_quality_medium_detail' },
  high: { label: 'generation_quality_high', detail: 'generation_quality_high_detail' },
} as const satisfies Record<GenerationQuality, Record<'label' | 'detail', TranslationKey>>;

export const SIZE_DETAIL_KEYS = {
  '1024x1024': 'generation_size_square_detail',
  '1024x1536': 'generation_size_portrait_detail',
  '1536x1024': 'generation_size_landscape_detail',
} as const satisfies Record<GenerationSize, TranslationKey>;

export function formatGenerationHistoryDate(value: string, locale: Locale) {
  return new Date(value).toLocaleString(localeToIntlLocale(locale), {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function interpolateGenerationCopy(message: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    message,
  );
}

export function generationCtaKey({
  isGuest,
  isFreeQualityBlocked,
  submitting,
  plan,
}: {
  isGuest: boolean;
  isFreeQualityBlocked: boolean;
  submitting: boolean;
  plan: 'guest' | 'free' | 'pro';
}): TranslationKey {
  if (isGuest) return 'generation_login_cta';
  if (isFreeQualityBlocked) return 'generation_upgrade_cta';
  if (submitting) return 'generation_submitting_cta';
  return plan === 'free' ? 'generation_free_cta' : 'generation_submit_cta';
}

export function templateCopyKey(templateKey: string) {
  return TEMPLATE_COPY_KEYS[templateKey as keyof typeof TEMPLATE_COPY_KEYS] ?? TEMPLATE_COPY_KEYS.photo_inspiration;
}
