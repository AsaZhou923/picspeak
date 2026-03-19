export const DEMO_IMAGE_URL =
  'https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev/user_108706949454492657694/2026/03/obj_4fea1f667283448c.jpg';

export const DEMO_REVIEW_IDS = [
  'rev_8424d4fbde054759',
  'rev_35e0951d0df94a1e',
] as const;

export const DEMO_REVIEW_ID = DEMO_REVIEW_IDS[0];

export function isDemoReviewId(reviewId: string): boolean {
  return DEMO_REVIEW_IDS.includes(reviewId as (typeof DEMO_REVIEW_IDS)[number]);
}
