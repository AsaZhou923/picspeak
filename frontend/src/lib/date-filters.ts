/**
 * Shared date filter helpers for the `yyyy/mm/dd` display format used by the
 * account reviews page and the public gallery.
 *
 * The display format is `yyyy/mm/dd` (slash-separated) so users can type dates
 * ergonomically, while the API consumes ISO `yyyy-mm-dd` strings. These helpers
 * convert between the two representations and validate real calendar dates
 * (e.g. `2026/02/30` is rejected because February has no 30th day).
 *
 * Previously this logic was duplicated across `app/account/reviews/page.tsx`,
 * `components/gallery/GalleryFilters.tsx`, and `app/gallery/GalleryClientPage.tsx`.
 */

const DISPLAY_DATE_PATTERN = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/**
 * Normalize free-form numeric input into the progressive `yyyy/mm/dd` display
 * shape, inserting slashes as digits arrive (e.g. `2026` → `2026`, `202601` →
 * `2026/01`). Keeps the field readable while typing.
 */
export function normalizeDateDisplay(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);

  if (digits.length <= 4) return year;
  if (digits.length <= 6) return `${year}/${month}`;
  return `${year}/${month}/${day}`;
}

/**
 * Convert a `yyyy/mm/dd` display value into an ISO `yyyy-mm-dd` string.
 * Returns `null` when the value is not a complete, real calendar date
 * (invalid format or a non-existent day such as `2026/02/30`).
 */
export function displayDateToIso(value: string): string | null {
  const match = value.match(DISPLAY_DATE_PATTERN);
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

/** Inverse of {@link displayDateToIso}: ISO `yyyy-mm-dd` → display `yyyy/mm/dd`. */
export function isoDateToDisplay(value: string): string {
  return value.replace(/-/g, '/');
}

/**
 * Whether a display value looks like a completed (`yyyy/mm/dd`) date but is not
 * a valid calendar date. Empty or still-being-typed values are treated as valid
 * so users are not flagged for errors mid-entry.
 */
export function isInvalidCompletedDate(value: string): boolean {
  return value.length === 10 && displayDateToIso(value) === null;
}
