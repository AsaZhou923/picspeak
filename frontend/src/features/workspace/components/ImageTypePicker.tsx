import { ImageType } from '@/lib/types';
import { type Translator } from '@/lib/i18n';
import { Check } from 'lucide-react';

const IMAGE_TYPE_IDS = ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as const;

interface ImageTypePickerProps {
  value: ImageType;
  onChange: (type: ImageType) => void;
  variant?: 'compact' | 'full';
  t: Translator;
}

export function ImageTypePicker({ value, onChange, variant = 'full', t }: ImageTypePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t('select_image_type')}>
      {IMAGE_TYPE_IDS.map((id) => {
        const selected = value === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(id)}
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-control border px-3 text-xs font-bold transition-all duration-200 active:scale-[0.98] ${
              selected
                ? 'border-gold/50 bg-gold/10 text-gold shadow-level-1'
                : `border-border-subtle bg-raised/40 text-ink-muted hover:border-gold/30 hover:bg-raised hover:text-ink ${variant === 'compact' ? 'py-2' : 'py-2.5'}`
            }`}
          >
            {selected && <Check size={13} aria-hidden="true" />}
            {t(`image_type_${id}`)}
          </button>
        );
      })}
    </div>
  );
}
