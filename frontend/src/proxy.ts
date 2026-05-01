import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import { isSupportedLocale, LOCALE_COOKIE_NAME, type SupportedLocale } from '@/lib/locale';
import { siteConfig } from '@/lib/site';

const productionOrigin = new URL(siteConfig.url).origin;
const productionWwwOrigin = productionOrigin.includes('://www.')
  ? productionOrigin
  : productionOrigin.replace('://', '://www.');

const developmentOrigins =
  process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const authorizedParties = Array.from(new Set([...developmentOrigins, productionOrigin, productionWwwOrigin]));

function localeFromPathname(pathname: string): SupportedLocale | null {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (isSupportedLocale(firstSegment)) {
    return firstSegment;
  }
  return null;
}

export default clerkMiddleware(
  (_auth, request) => {
    const requestHeaders = new Headers(request.headers);
    const pathLocale = localeFromPathname(request.nextUrl.pathname);
    const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    const locale = pathLocale ?? (isSupportedLocale(cookieLocale) ? cookieLocale : null);
    if (locale) {
      requestHeaders.set('x-picspeak-locale', locale);
    }
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  },
  {
    authorizedParties,
  }
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
