export const REVIEW_ORGANIZATION_TAG_LIMIT = 8;
export const REVIEW_ORGANIZATION_TAG_MAX_LENGTH = 32;
export const REVIEW_ORGANIZATION_NOTE_MAX_LENGTH = 1000;
export const REVIEW_ORGANIZATION_SEARCH_MAX_LENGTH = 100;

export type ReviewOrganizationDraft = {
  tagsText: string;
  note: string;
};

export type ReviewOrganizationTagDraftStats = {
  accepted: string[];
  enteredCount: number;
  overLimitCount: number;
  tooLongCount: number;
  duplicateCount: number;
  hasOverflow: boolean;
};

export type ReviewOrganizationHistoryQuery = {
  cursor?: string;
  limit?: number;
  created_from?: string;
  created_to?: string;
  min_score?: number;
  max_score?: number;
  image_type?: string;
  favorite_only?: boolean;
  q?: string;
  tag?: string[];
};

export function normalizeReviewOrganizationTags(input: string): string[] {
  return reviewOrganizationTagDraftStats(input).accepted;
}

export function reviewOrganizationTagDraftStats(input: string): ReviewOrganizationTagDraftStats {
  const tags: string[] = [];
  const seen = new Set<string>();
  let enteredCount = 0;
  let overLimitCount = 0;
  let tooLongCount = 0;
  let duplicateCount = 0;

  input
    .split(/[,\n#]/)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .forEach((item) => {
      enteredCount += 1;
      if (item.length > REVIEW_ORGANIZATION_TAG_MAX_LENGTH) {
        tooLongCount += 1;
      }
      const tag = item.slice(0, REVIEW_ORGANIZATION_TAG_MAX_LENGTH);
      const key = tag.toLocaleLowerCase();
      if (seen.has(key)) {
        duplicateCount += 1;
        return;
      }
      if (tags.length >= REVIEW_ORGANIZATION_TAG_LIMIT) {
        overLimitCount += 1;
        return;
      }
      seen.add(key);
      tags.push(tag);
    });

  return {
    accepted: tags,
    enteredCount,
    overLimitCount,
    tooLongCount,
    duplicateCount,
    hasOverflow: overLimitCount > 0 || tooLongCount > 0,
  };
}

export function normalizeReviewOrganizationNote(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, REVIEW_ORGANIZATION_NOTE_MAX_LENGTH);
}

export function draftFromReviewOrganization(tags?: string[] | null, note?: string | null): ReviewOrganizationDraft {
  return {
    tagsText: (tags ?? []).join(', '),
    note: note ?? '',
  };
}

export function buildReviewOrganizationPayload(draft: ReviewOrganizationDraft): { tags: string[]; note: string } {
  return {
    tags: normalizeReviewOrganizationTags(draft.tagsText),
    note: normalizeReviewOrganizationNote(draft.note),
  };
}

export function reviewOrganizationDraftIsDirty(
  draft: ReviewOrganizationDraft,
  persistedTags?: string[] | null,
  persistedNote?: string | null,
): boolean {
  const persisted = draftFromReviewOrganization(persistedTags, persistedNote);
  return draft.tagsText !== persisted.tagsText || draft.note !== persisted.note;
}

export function normalizeReviewSearchText(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, REVIEW_ORGANIZATION_SEARCH_MAX_LENGTH);
}

export function normalizeReviewSearchTags(input: string): string[] {
  return normalizeReviewOrganizationTags(input);
}

export function buildReviewOrganizationHistoryPath(query: ReviewOrganizationHistoryQuery = {}): string {
  const params = new URLSearchParams({ limit: String(query.limit ?? 20) });
  if (query.cursor) params.set('cursor', query.cursor);
  if (query.created_from) params.set('created_from', query.created_from);
  if (query.created_to) params.set('created_to', query.created_to);
  if (typeof query.min_score === 'number') params.set('min_score', String(query.min_score));
  if (typeof query.max_score === 'number') params.set('max_score', String(query.max_score));
  if (query.image_type) params.set('image_type', query.image_type);
  if (query.favorite_only) params.set('favorite_only', 'true');
  const q = normalizeReviewSearchText(query.q ?? '');
  if (q) params.set('q', q);
  normalizeReviewSearchTags((query.tag ?? []).join(',')).forEach((tag) => params.append('tag', tag));
  return `/me/reviews?${params.toString()}`;
}
