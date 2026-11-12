import type { Metadata } from 'next';
import * as React from 'react';
import { buildProfileApiUrl, type PublicProfileResponse } from './api.ts';
import { getProfileCopy, type ProfileLocale } from './profile-copy.ts';
import { INDEXABLE_ROBOTS, NO_INDEX_ROBOTS, singlePageAlternates } from '../../lib/seo.ts';

// React.cache dedupes the lookup between generateMetadata and the layout in a
// server render; outside React Server Components it is a plain function.
const perRequest: <T extends (...args: never[]) => unknown>(fn: T) => T =
  typeof (React as { cache?: unknown }).cache === 'function'
    ? (React as unknown as { cache: <T>(fn: T) => T }).cache
    : (fn) => fn;

const PROFILE_METADATA_TIMEOUT_MS = 4000;

export type PublicProfileLookup =
  | { state: 'found'; profile: PublicProfileResponse }
  | { state: 'missing' }
  | { state: 'unknown' };

/**
 * Server-side lookup shared by metadata and layout within one request. Only a
 * definite backend 404 counts as missing; network errors and 5xx stay
 * "unknown" so a temporary outage never turns real profiles into 404s.
 */
export const lookupPublicProfile = perRequest(async (publicProfileId: string): Promise<PublicProfileLookup> => {
  if (!publicProfileId || publicProfileId.length > 128) return { state: 'missing' };
  try {
    const response = await fetch(buildProfileApiUrl(`/profiles/${encodeURIComponent(publicProfileId)}?limit=1`), {
      cache: 'no-store',
      signal: AbortSignal.timeout(PROFILE_METADATA_TIMEOUT_MS),
    });
    if (response.status === 404) return { state: 'missing' };
    if (!response.ok) return { state: 'unknown' };
    const profile = (await response.json()) as PublicProfileResponse;
    if (!profile?.public_profile_id || typeof profile.username !== 'string') return { state: 'unknown' };
    return { state: 'found', profile };
  } catch {
    return { state: 'unknown' };
  }
});

export function buildPublicProfileMetadata(lookup: PublicProfileLookup, locale: ProfileLocale): Metadata {
  const copy = getProfileCopy(locale);
  if (lookup.state !== 'found') {
    // Never inherit the homepage canonical/hreflang for an unresolved profile.
    return {
      title: lookup.state === 'missing' ? copy.notFound : copy.unavailable,
      alternates: null,
      robots: NO_INDEX_ROBOTS,
    };
  }
  const { profile } = lookup;
  const path = `/u/${encodeURIComponent(profile.public_profile_id)}`;
  const title = `${profile.username}${copy.metaTitleSuffix}`;
  const description = copy.metaDescription(profile.username, profile.gallery_review_count);
  return {
    title,
    description,
    alternates: singlePageAlternates(path),
    robots: INDEXABLE_ROBOTS,
    openGraph: {
      type: 'profile',
      url: path,
      title,
      description,
      ...(profile.avatar_url ? { images: [{ url: profile.avatar_url, alt: profile.username }] } : {}),
    },
  };
}
