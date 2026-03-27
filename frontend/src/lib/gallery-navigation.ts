import { PublicGalleryItem } from '@/lib/types';

export const GALLERY_RESTORE_STORAGE_KEY = 'picspeak.gallery.restore.v2';

const GALLERY_RESTORE_TTL_MS = 30 * 60 * 1000;

export interface GalleryRestoreState {
  version: 1;
  savedAt: number;
  pages: PublicGalleryItem[][];
  totalCount: number;
  nextCursor: string | null;
  pageIndex: number;
  scrollY: number;
  reviewId: string | null;
}

interface GalleryRestoreStore {
  version: 1;
  entries: Record<string, GalleryRestoreState>;
}

function isPublicGalleryItem(value: unknown): value is PublicGalleryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PublicGalleryItem>;
  return (
    typeof item.review_id === 'string' &&
    typeof item.photo_id === 'string' &&
    typeof item.mode === 'string' &&
    typeof item.image_type === 'string' &&
    typeof item.final_score === 'number' &&
    typeof item.summary === 'string' &&
    typeof item.owner_username === 'string' &&
    typeof item.like_count === 'number' &&
    typeof item.liked_by_viewer === 'boolean' &&
    typeof item.recommended === 'boolean' &&
    typeof item.gallery_added_at === 'string' &&
    typeof item.created_at === 'string'
  );
}

function isGalleryRestoreState(value: unknown): value is GalleryRestoreState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<GalleryRestoreState>;
  return (
    state.version === 1 &&
    typeof state.savedAt === 'number' &&
    Array.isArray(state.pages) &&
    state.pages.every((page) => Array.isArray(page) && page.every(isPublicGalleryItem)) &&
    typeof state.totalCount === 'number' &&
    (typeof state.nextCursor === 'string' || state.nextCursor === null) &&
    typeof state.pageIndex === 'number' &&
    typeof state.scrollY === 'number' &&
    (typeof state.reviewId === 'string' || state.reviewId === null)
  );
}

function isGalleryRestoreStore(value: unknown): value is GalleryRestoreStore {
  if (!value || typeof value !== 'object') return false;
  const store = value as Partial<GalleryRestoreStore>;
  return (
    store.version === 1 &&
    store.entries !== undefined &&
    typeof store.entries === 'object' &&
    store.entries !== null &&
    Object.values(store.entries).every(isGalleryRestoreState)
  );
}

function hasValidPage(state: GalleryRestoreState): boolean {
  return state.pages.length > 0 && state.pageIndex >= 0 && state.pageIndex < state.pages.length;
}

function getEmptyStore(): GalleryRestoreStore {
  return {
    version: 1,
    entries: {},
  };
}

function sanitizeStore(store: GalleryRestoreStore): GalleryRestoreStore {
  const now = Date.now();
  const entries = Object.fromEntries(
    Object.entries(store.entries).filter(([, state]) => {
      if (now - state.savedAt > GALLERY_RESTORE_TTL_MS) return false;
      return hasValidPage(state);
    })
  );

  return {
    version: 1,
    entries,
  };
}

function readStore(): GalleryRestoreStore {
  if (typeof window === 'undefined') return getEmptyStore();

  try {
    const raw = window.sessionStorage.getItem(GALLERY_RESTORE_STORAGE_KEY);
    if (!raw) return getEmptyStore();

    const parsed = JSON.parse(raw) as unknown;
    if (!isGalleryRestoreStore(parsed)) {
      window.sessionStorage.removeItem(GALLERY_RESTORE_STORAGE_KEY);
      return getEmptyStore();
    }

    const sanitized = sanitizeStore(parsed);
    window.sessionStorage.setItem(GALLERY_RESTORE_STORAGE_KEY, JSON.stringify(sanitized));
    return sanitized;
  } catch {
    window.sessionStorage.removeItem(GALLERY_RESTORE_STORAGE_KEY);
    return getEmptyStore();
  }
}

function writeStore(store: GalleryRestoreStore): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(GALLERY_RESTORE_STORAGE_KEY, JSON.stringify(sanitizeStore(store)));
}

export function buildGalleryRestoreKey(search: string): string {
  const normalized = search.startsWith('?') ? search.slice(1) : search;
  return normalized ? `/gallery?${normalized}` : '/gallery';
}

export function readGalleryRestoreState(key: string): GalleryRestoreState | null {
  const store = readStore();
  return store.entries[key] ?? null;
}

export function saveGalleryRestoreState(
  key: string,
  state: Omit<GalleryRestoreState, 'version' | 'savedAt'>
): void {
  if (typeof window === 'undefined') return;

  const store = readStore();
  store.entries[key] = {
    version: 1,
    savedAt: Date.now(),
    ...state,
  };
  writeStore(store);
}
