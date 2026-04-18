import { ImageType } from '@/lib/types';

const IMAGE_TYPE_IDS = ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as const;

interface ImageTypePickerProps {
  value: ImageType;
  onChange: (type: ImageType) => void;
  variant?: 'compact' | 'full';
  t: (key: string) => string;
}

export function ImageTypePicker({ value, onChange, variant = 'full', t }: ImageTypePickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {IMAGE_TYPE_IDS.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={
            variant === 'compact'
              ? `rounded border px-3 py-2 text-xs transition-colors ${value === id ? 'border-gold/60 bg-gold/5 text-gold' : 'border-border text-ink-muted hover:border-gold/30 hover:text-ink'}`
              : `px-3 py-2.5 rounded-lg border text-xs font-medium transition-all duration-200 active:scale-95 ${value === id ? 'border-gold/60 text-gold bg-gold/10 shadow-[0_4px_16px_rgba(200,162,104,0.12)]' : 'border-border text-ink-muted hover:text-ink hover:border-gold/30 hover:bg-raised/40'}`
          }
        >
          {t(`image_type_${id}`)}
        </button>
      ))}
    </div>
  );
}
