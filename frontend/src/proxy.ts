import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

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

function localeFromPathname(pathname: string): 'zh' | 'en' | 'ja' {
  const firstSegment = pathname.split('/').filter(Boolean)[0];
  if (firstSegment === 'zh' || firstSegment === 'ja' || firstSegment === 'en') {
    return firstSegment;
  }
  return 'en';
}

export default clerkMiddleware(
  (_auth, request) => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-picspeak-locale', localeFromPathname(request.nextUrl.pathname));
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
