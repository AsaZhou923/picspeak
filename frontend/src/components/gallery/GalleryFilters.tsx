'use client';

import { CalendarDays, SlidersHorizontal } from 'lucide-react';
import { useRef } from 'react';
import { ImageType } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

export type FilterDraft = {
  createdFrom: string;
  createdTo: string;
  minScore: string;
  maxScore: string;
  imageType: '' | ImageType;
};

interface GalleryFiltersProps {
  draftFilters: FilterDraft;
  setDraftFilters: React.Dispatch<React.SetStateAction<FilterDraft>>;
  onApply: () => void;
  onReset: () => void;
  hasInvalidDate: boolean;
  createdFromInvalid: boolean;
  createdToInvalid: boolean;
}

function normalizeDateDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  if (digits.length <= 4) return year;
  if (digits.length <= 6) return `${year}/${month}`;
  return `${year}/${month}/${day}`;
}

function displayDateToIso(value: string): string | null {
  const match = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (!match) return null;

  const [, year, month, day] = match;
  const isoDate = `${year}-${month}-${day}`;
  const parsed = new Date(`${isoDate}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return null;
  if (
    parsed.getFullYear() !== Number(year) ||
    parsed.getMonth() + 1 !== Number(month) ||
    parsed.getDate() !== Number(day)
  ) {
    return null;
  }

  return isoDate;
}

function isoDateToDisplay(value: string): string {
  return value.replace(/-/g, '/');
}

function DateFilterField({
  label,
  value,
  error,
  onChange,
  placeholder,
  calendarLabel,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  placeholder: string;
  calendarLabel: string;
}) {
  const nativeInputRef = useRef<HTMLInputElement>(null);
  const nativeValue = displayDateToIso(value) ?? '';

  return (
    <label className="min-w-0 space-y-2 text-xs text-ink-muted">
      <span>{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(normalizeDateDisplay(event.target.value))}
          aria-invalid={Boolean(error)}
          className={`w-full min-w-0 rounded-xl border bg-void/60 px-3 py-2.5 pr-10 text-[13px] text-ink [font-variant-numeric:tabular-nums] outline-none transition-colors placeholder:text-ink-subtle ${
            error ? 'border-rust/60 focus:border-rust' : 'border-border focus:border-gold/40'
          }`}
        />
        <button
          type="button"
          aria-label={calendarLabel}
          onClick={() => {
            const input = nativeInputRef.current;
            if (!input) return;
            input.showPicker?.();
            input.focus();
            input.click();
          }}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-subtle transition-colors hover:text-gold"
        >
          <CalendarDays size={14} />
        </button>
        <input
          ref={nativeInputRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={nativeValue}
          onChange={(event) => onChange(isoDateToDisplay(event.target.value))}
          className="pointer-events-none absolute bottom-0 right-0 h-0 w-0 opacity-0"
        />
      </div>
      {error && <p className="text-[11px] leading-5 text-rust">{error}</p>}
    </label>
  );
}

function getImageTypeLabel(t: (k: any) => string, imageType?: ImageType) {
  const normalized = imageType ?? 'default';
  const keyMap: Record<ImageType, any> = {
    default: 'image_type_default',
    landscape: 'image_type_landscape',
    portrait: 'image_type_portrait',
    street: 'image_type_street',
    still_life: 'image_type_still_life',
    architecture: 'image_type_architecture',
  };
  return t(keyMap[normalized]);
}

export default function GalleryFilters({
  draftFilters,
  setDraftFilters,
  onApply,
  onReset,
  hasInvalidDate,
  createdFromInvalid,
  createdToInvalid,
}: GalleryFiltersProps) {
  const { t } = useI18n();

  const invalidDateCopy = t('err_unknown_body'); // Fallback or specific key

  return (
    <section className="mt-6 rounded-[24px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_35%),rgba(18,16,13,0.72)] p-5 transition-all duration-300 hover:border-gold/20">
      <div className="mb-4 flex items-center gap-2 text-sm text-ink">
        <SlidersHorizontal size={15} className="text-gold" />
        <span>{t('filter_label')}</span>
      </div>

      <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
        <DateFilterField
          label={t('filter_from')}
          value={draftFilters.createdFrom}
          error={createdFromInvalid ? t('err_unknown_body') : undefined}
          onChange={(value) =>
            setDraftFilters((prev) => ({ ...prev, createdFrom: value }))
          }
          placeholder={t('filter_date_placeholder')}
          calendarLabel={t('filter_calendar_label').replace('{label}', t('filter_from'))}
        />

        <DateFilterField
          label={t('filter_to')}
          value={draftFilters.createdTo}
          error={createdToInvalid ? t('err_unknown_body') : undefined}
          onChange={(value) =>
            setDraftFilters((prev) => ({ ...prev, createdTo: value }))
          }
          placeholder={t('filter_date_placeholder')}
          calendarLabel={t('filter_calendar_label').replace('{label}', t('filter_to'))}
        />

        <label className="min-w-0 space-y-2 text-xs text-ink-muted">
          <span>{t('filter_min_score')}</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={draftFilters.minScore}
            onChange={(event) =>
              setDraftFilters((prev) => ({ ...prev, minScore: event.target.value }))
            }
            className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
          />
        </label>

        <label className="min-w-0 space-y-2 text-xs text-ink-muted">
          <span>{t('filter_max_score')}</span>
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={draftFilters.maxScore}
            onChange={(event) =>
              setDraftFilters((prev) => ({ ...prev, maxScore: event.target.value }))
            }
            className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
          />
        </label>

        <label className="min-w-0 space-y-2 text-xs text-ink-muted">
          <span>{t('filter_image_type')}</span>
          <select
            value={draftFilters.imageType}
            onChange={(event) =>
              setDraftFilters((prev) => ({
                ...prev,
                imageType: event.target.value as '' | ImageType,
              }))
            }
            className="w-full min-w-0 rounded-xl border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
          >
            <option value="">{t('filter_all_types')}</option>
            {(['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'] as ImageType[]).map((type) => (
              <option key={type} value={type}>
                {getImageTypeLabel(t, type)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={hasInvalidDate}
          className="rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-50 active:scale-95"
        >
          {t('filter_apply')}
        </button>
        <button
          type="button"
          onClick={onReset}
          className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink active:scale-95"
        >
          {t('filter_reset')}
        </button>
      </div>
    </section>
  );
}
