import { displayDateToIso, isoDateToDisplay } from '@/lib/date-filters';
import type { PublicGalleryQuery } from '@/lib/types';
import type { FilterDraft } from '@/components/gallery/GalleryFilters';

export const GALLERY_PAGE_SIZE = 12;

export const EMPTY_GALLERY_FILTERS: FilterDraft = {
  createdFrom: '',
  createdTo: '',
  minScore: '',
  maxScore: '',
  imageType: '',
  sort: 'default',
};

export function galleryFiltersFromSearchParams(searchParams: URLSearchParams): FilterDraft {
  return {
    createdFrom: searchParams.get('created_from') ? isoDateToDisplay(searchParams.get('created_from') as string) : '',
    createdTo: searchParams.get('created_to') ? isoDateToDisplay(searchParams.get('created_to') as string) : '',
    minScore: searchParams.get('min_score') ?? '',
    maxScore: searchParams.get('max_score') ?? '',
    imageType: (searchParams.get('image_type') as FilterDraft['imageType']) ?? '',
    sort: searchParams.get('sort') ?? 'default',
  };
}

export function buildGallerySearchParams(filters: FilterDraft, options?: { restore?: boolean }): URLSearchParams {
  const params = new URLSearchParams();
  const createdFromIso = displayDateToIso(filters.createdFrom);
  const createdToIso = displayDateToIso(filters.createdTo);

  if (createdFromIso) params.set('created_from', createdFromIso);
  if (createdToIso) params.set('created_to', createdToIso);
  if (filters.minScore !== '') params.set('min_score', filters.minScore);
  if (filters.maxScore !== '') params.set('max_score', filters.maxScore);
  if (filters.imageType) params.set('image_type', filters.imageType);
  if (filters.sort && filters.sort !== 'default') params.set('sort', filters.sort);
  if (options?.restore) params.set('restore', '1');

  return params;
}

export function toGalleryQuery(filters: FilterDraft): PublicGalleryQuery {
  const query: PublicGalleryQuery = { limit: GALLERY_PAGE_SIZE };
  const createdFromIso = displayDateToIso(filters.createdFrom);
  const createdToIso = displayDateToIso(filters.createdTo);

  if (createdFromIso) {
    query.created_from = new Date(`${createdFromIso}T00:00:00`).toISOString();
  }
  if (createdToIso) {
    query.created_to = new Date(`${createdToIso}T23:59:59.999`).toISOString();
  }
  if (filters.minScore !== '') {
    query.min_score = Number(filters.minScore);
  }
  if (filters.maxScore !== '') {
    query.max_score = Number(filters.maxScore);
  }
  if (filters.imageType) {
    query.image_type = filters.imageType;
  }
  if (filters.sort) {
    query.sort = filters.sort;
  }

  return query;
}
