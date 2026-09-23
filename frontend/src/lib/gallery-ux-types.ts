export type ImageType = 'default' | 'landscape' | 'portrait' | 'street' | 'still_life' | 'architecture';
export type GalleryColumnPreference = 'auto' | '1' | '2' | '3';
export type GalleryDensityPreference = 'full' | 'compact';

export interface PublicGalleryItem {
  review_id: string;
  photo_id: string;
  photo_url: string | null;
  photo_thumbnail_url: string | null;
  mode: 'flash' | 'pro' | string;
  image_type: ImageType;
  final_score: number;
  score_version: string;
  summary: string;
  owner_username: string;
  owner_avatar_url: string | null;
  owner_profile_url?: string | null;
  like_count: number;
  liked_by_viewer: boolean;
  recommended: boolean;
  score_percentile: number | null;
  gallery_added_at: string;
  created_at: string;
}

export interface GalleryScoreboardResponse {
  items: PublicGalleryItem[];
  window_days: 7 | 30;
  as_of: string;
  window_start: string;
  window_end: string;
  ranking_mode: 'popular' | 'collection';
  ranking_rule_version: string;
  ranking_sort: string[];
  eligible_photo_count: number;
  eligible_author_count: number;
  cold_start_reasons: string[];
  image_type: ImageType | null;
}

export interface GalleryNeighborItem {
  review_id: string;
  gallery_added_at: string;
  final_score: number;
  like_count: number;
  owner_username: string;
  photo_thumbnail_url: string | null;
}

export interface GalleryNeighborsResponse {
  review_id: string;
  previous: GalleryNeighborItem | null;
  next: GalleryNeighborItem | null;
  back_href: string;
}
