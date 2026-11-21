import type { NextFetchEvent, NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import proxy from './proxy';
import { isPublicFontLicensePath } from './lib/app-route-roots';

const PUBLIC_FILE_PATTERN =
  /\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)$/i;

export default function middleware(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith('/_next/') ||
    PUBLIC_FILE_PATTERN.test(pathname) ||
    isPublicFontLicensePath(pathname)
  ) {
    return NextResponse.next();
  }

  return proxy(request, event);
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
