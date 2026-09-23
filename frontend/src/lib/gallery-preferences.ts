import type { GalleryColumnPreference, GalleryDensityPreference } from '@/lib/gallery-ux-types';

export const GALLERY_PREFERENCES_STORAGE_KEY = 'picspeak.gallery.preferences.v1';

export interface GalleryPreferences {
  columns: GalleryColumnPreference;
  density: GalleryDensityPreference;
}

const DEFAULT_GALLERY_PREFERENCES: GalleryPreferences = {
  columns: 'auto',
  density: 'full',
};

function isColumnPreference(value: unknown): value is GalleryColumnPreference {
  return value === 'auto' || value === '1' || value === '2' || value === '3';
}

function isDensityPreference(value: unknown): value is GalleryDensityPreference {
  return value === 'full' || value === 'compact';
}

export function sanitizeGalleryPreferences(value: unknown): GalleryPreferences {
  if (!value || typeof value !== 'object') return DEFAULT_GALLERY_PREFERENCES;
  const candidate = value as Partial<GalleryPreferences>;
  return {
    columns: isColumnPreference(candidate.columns) ? candidate.columns : DEFAULT_GALLERY_PREFERENCES.columns,
    density: isDensityPreference(candidate.density) ? candidate.density : DEFAULT_GALLERY_PREFERENCES.density,
  };
}

export function readGalleryPreferences(): GalleryPreferences {
  if (typeof window === 'undefined') return DEFAULT_GALLERY_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(GALLERY_PREFERENCES_STORAGE_KEY);
    if (!raw) return DEFAULT_GALLERY_PREFERENCES;
    return sanitizeGalleryPreferences(JSON.parse(raw) as unknown);
  } catch {
    window.localStorage.removeItem(GALLERY_PREFERENCES_STORAGE_KEY);
    return DEFAULT_GALLERY_PREFERENCES;
  }
}

export function writeGalleryPreferences(preferences: GalleryPreferences): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(GALLERY_PREFERENCES_STORAGE_KEY, JSON.stringify(sanitizeGalleryPreferences(preferences)));
}

export function galleryGridClassName(columns: GalleryColumnPreference): string {
  if (columns === '1') return 'grid-cols-1';
  if (columns === '2') return 'grid-cols-1 md:grid-cols-2';
  if (columns === '3') return 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';
  return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
}
