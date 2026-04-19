import { Zap, Star } from 'lucide-react';
import { type Translator } from '@/lib/i18n';

const MODE_OPTIONS = [
  { id: 'flash' as const, icon: Zap, title: 'Flash', descKey: 'mode_flash_desc' },
  { id: 'pro' as const, icon: Star, title: 'Pro', descKey: 'mode_pro_desc' },
] as const;

interface ModePickerProps {
  value: 'flash' | 'pro';
  onChange: (mode: 'flash' | 'pro') => void;
  isGuest: boolean;
  promoModeBadge: string;
  variant?: 'compact' | 'full';
  t: Translator;
}

export function ModePicker({ value, onChange, isGuest, promoModeBadge, variant = 'full', t }: ModePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {MODE_OPTIONS.map((m) => {
        const disabled = isGuest && m.id === 'pro';
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => !disabled && onChange(m.id)}
            disabled={disabled}
            className={`flex items-start gap-3 p-4 ${variant === 'compact' ? 'rounded-lg' : 'rounded-xl'} border text-left transition-all ${variant === 'compact' ? 'duration-200' : 'duration-300'} ${
              disabled
                ? 'opacity-40 cursor-not-allowed border-border'
                : active
                  ? variant === 'compact'
                    ? 'border-gold/60 bg-gold/5 shadow-[0_0_16px_rgba(200,162,104,0.12)]'
                    : 'border-gold/60 bg-gold/10 shadow-[0_8px_32px_rgba(200,162,104,0.14)] scale-[1.02] z-10'
                  : 'border-border hover:border-gold/30 hover:bg-raised/60 active:scale-[0.98]'
            }`}
          >
            <m.icon size={16} className={active ? 'mt-0.5 text-gold' : 'mt-0.5 text-ink-subtle'} />
            <div>
              <p className={`text-sm ${variant === 'compact' ? 'font-medium' : 'font-bold'} ${active ? 'text-gold' : 'text-ink'}`}>
                {m.title}
                {m.id === 'pro' && (
                  <span className={`ml-2 rounded-full border border-gold/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] ${variant === 'compact' ? 'bg-gold/10 text-gold/80' : 'bg-gold/15 text-gold/90 font-mono'}`}>
                    {promoModeBadge}
                  </span>
                )}
              </p>
              <p className={`${variant === 'compact' ? 'mt-0.5 text-xs' : 'text-[11px] leading-relaxed mt-1 font-medium'} text-ink-muted`}>
                {disabled ? t('mode_pro_guest') : t(m.descKey)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
