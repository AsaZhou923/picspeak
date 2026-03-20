'use client';

import { GalleryItem } from './types';

const GALLERY_STORAGE_KEY = 'ps_image_gallery_v1';

function sortGallery(items: GalleryItem[]): GalleryItem[] {
  return [...items].sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
}

function isGalleryItem(value: unknown): value is GalleryItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.review_id === 'string' &&
    typeof item.photo_id === 'string' &&
    (typeof item.photo_url === 'string' || item.photo_url === null) &&
    (typeof item.photo_thumbnail_url === 'string' || item.photo_thumbnail_url === null || item.photo_thumbnail_url === undefined) &&
    (item.mode === 'flash' || item.mode === 'pro') &&
    typeof item.image_type === 'string' &&
    typeof item.final_score === 'number' &&
    typeof item.created_at === 'string' &&
    typeof item.saved_at === 'string' &&
    typeof item.summary === 'string'
  );
}

export function readGalleryItems(): GalleryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(GALLERY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return sortGallery(parsed.filter(isGalleryItem));
  } catch {
    return [];
  }
}

export function writeGalleryItems(items: GalleryItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(GALLERY_STORAGE_KEY, JSON.stringify(sortGallery(items)));
  } catch {
    // Best-effort persistence only.
  }
}

export function hasGalleryItem(reviewId: string): boolean {
  return readGalleryItems().some((item) => item.review_id === reviewId);
}

export function saveGalleryItem(item: GalleryItem): void {
  const existing = readGalleryItems().filter((entry) => entry.review_id !== item.review_id);
  existing.unshift(item);
  writeGalleryItems(existing);
}

export function removeGalleryItem(reviewId: string): void {
  writeGalleryItems(readGalleryItems().filter((item) => item.review_id !== reviewId));
}
