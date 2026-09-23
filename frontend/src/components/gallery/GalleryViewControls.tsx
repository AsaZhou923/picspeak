'use client';

import { Columns3, Rows3 } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import type { GalleryPreferences } from '@/lib/gallery-preferences';
import { getGalleryUxCopy } from '@/lib/gallery-ux-copy';

interface GalleryViewControlsProps {
  locale: Locale;
  preferences: GalleryPreferences;
  onChange: (preferences: GalleryPreferences) => void;
}

export default function GalleryViewControls({ locale, preferences, onChange }: GalleryViewControlsProps) {
  const copy = getGalleryUxCopy(locale);
  const columnOptions = [
    ['auto', copy.auto],
    ['1', copy.oneColumn],
    ['2', copy.twoColumns],
    ['3', copy.threeColumns],
  ] as const;
  const densityOptions = [
    ['full', copy.full],
    ['compact', copy.compact],
  ] as const;

  return (
    <section className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface/70 px-3 py-3">
      <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-ink-subtle">
        <Rows3 size={14} className="text-gold" />
        {copy.view}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-control border border-border/40 bg-void/40 p-1" aria-label={copy.columns}>
          {columnOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...preferences, columns: value })}
              aria-pressed={preferences.columns === value}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-control px-3 py-1.5 text-xs transition-colors ${
                preferences.columns === value ? 'bg-action text-action-ink' : 'text-ink-muted hover:bg-gold/10 hover:text-gold'
              }`}
            >
              <Columns3 size={13} />
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-control border border-border/40 bg-void/40 p-1">
          {densityOptions.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange({ ...preferences, density: value })}
              aria-pressed={preferences.density === value}
              className={`min-h-10 rounded-control px-3 py-1.5 text-xs transition-colors ${
                preferences.density === value ? 'bg-action text-action-ink' : 'text-ink-muted hover:bg-gold/10 hover:text-gold'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
