import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { buildPublicProfileMetadata, lookupPublicProfile } from '@/features/profile/public-profile-metadata';
import type { Locale } from '@/lib/i18n';
import { isSupportedLocale } from '@/lib/locale';

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-picspeak-locale');
  return isSupportedLocale(locale) ? locale : 'en';
}

export async function generateMetadata(
  { params }: { params: Promise<{ publicProfileId: string }> }
): Promise<Metadata> {
  const { publicProfileId } = await params;
  const [lookup, locale] = await Promise.all([lookupPublicProfile(publicProfileId), getRequestLocale()]);
  return buildPublicProfileMetadata(lookup, locale);
}

export default async function PublicProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ publicProfileId: string }>;
}) {
  const { publicProfileId } = await params;
  const lookup = await lookupPublicProfile(publicProfileId);
  if (lookup.state === 'missing') notFound();
  return <>{children}</>;
}
