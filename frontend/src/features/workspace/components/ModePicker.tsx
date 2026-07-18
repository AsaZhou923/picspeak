import { Check, Lock, Star, Zap } from 'lucide-react';
import { type Translator } from '@/lib/i18n';

const MODE_OPTIONS = [
  { id: 'flash' as const, icon: Zap, title: 'Flash', descKey: 'mode_flash_desc' },
  { id: 'pro' as const, icon: Star, title: 'Pro', descKey: 'mode_pro_desc' },
] as const;

interface ModePickerProps {
  value: 'flash' | 'pro';
  onChange: (mode: 'flash' | 'pro') => void;
  isGuest: boolean;
  variant?: 'compact' | 'full';
  t: Translator;
}

export function ModePicker({ value, onChange, isGuest, variant = 'full', t }: ModePickerProps) {
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('select_mode')}>
      {MODE_OPTIONS.map((m) => {
        const disabled = isGuest && m.id === 'pro';
        const active = value === m.id;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => !disabled && onChange(m.id)}
            disabled={disabled}
            className={`relative flex min-h-24 items-start gap-3 rounded-card border p-3 text-left transition-all duration-200 sm:p-4 ${
              disabled
                ? 'cursor-not-allowed border-border-subtle bg-surface/30 opacity-60'
                : active
                  ? 'border-gold/50 bg-gold/10 shadow-level-1'
                  : 'border-border-subtle bg-raised/40 hover:border-gold/30 hover:bg-raised active:scale-[0.98]'
            }`}
          >
            <m.icon size={16} className={active ? 'mt-0.5 text-gold' : 'mt-0.5 text-ink-subtle'} />
            <div className="min-w-0 pr-4">
              <p className={`text-sm font-bold ${active ? 'text-gold' : 'text-ink'}`}>
                {m.title}
              </p>
              <p className={`${variant === 'compact' ? 'mt-1 text-xs' : 'mt-1 text-[11px] font-medium leading-relaxed'} text-ink-muted`}>
                {disabled ? t('mode_pro_guest') : t(m.descKey)}
              </p>
            </div>
            {disabled ? (
              <Lock size={13} className="absolute right-3 top-3 text-ink-subtle" aria-hidden="true" />
            ) : active ? (
              <Check size={14} className="absolute right-3 top-3 text-sage" aria-hidden="true" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
