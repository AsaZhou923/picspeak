import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import {
  getLocalizedBlogRedirectPath,
  LOCALE_COOKIE_NAME,
  resolveRequestLocale,
} from '@/lib/locale';
import { hasKnownAppPath } from '@/lib/app-route-roots';
import { siteConfig } from '@/lib/site';

function unknownRouteResponse(): NextResponse {
  return new NextResponse(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>Page not found | PicSpeak</title></head><body><main><h1>404 — Page not found</h1><p>The requested PicSpeak page does not exist.</p><a href="/en">Back to PicSpeak</a></main></body></html>',
    {
      status: 404,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
        'Content-Type': 'text/html; charset=utf-8',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    },
  );
}

const productionOrigin = new URL(siteConfig.url).origin;
const productionWwwOrigin = productionOrigin.includes('://www.')
  ? productionOrigin
  : productionOrigin.replace('://', '://www.');

const developmentOrigins =
  process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];

const authorizedParties = Array.from(new Set([...developmentOrigins, productionOrigin, productionWwwOrigin]));

export default clerkMiddleware(
  (_auth, request) => {
    if (!hasKnownAppPath(request.nextUrl.pathname)) {
      return unknownRouteResponse();
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-picspeak-locale');

    const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    const locale = resolveRequestLocale(request.nextUrl.pathname, cookieLocale);
    const blogRedirectPath = getLocalizedBlogRedirectPath(
      request.nextUrl.pathname,
      locale ?? 'en',
    );

    if (blogRedirectPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = blogRedirectPath;
      const response = NextResponse.redirect(redirectUrl, 307);
      response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      response.headers.set('Vary', 'Cookie');
      return response;
    }

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
