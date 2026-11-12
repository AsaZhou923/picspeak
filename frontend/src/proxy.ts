import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

import {
  getLocalizedBlogRedirectPath,
  LOCALE_COOKIE_NAME,
  type SupportedLocale,
  resolveRequestLocale,
} from '@/lib/locale';
import { hasKnownAppPath } from '@/lib/app-route-roots';
import { lookupPublicProfile } from '@/features/profile/public-profile-metadata';
import { siteConfig } from '@/lib/site';

const NOT_FOUND_COPY: Record<SupportedLocale, { title: string; heading: string; body: string; cta: string }> = {
  zh: {
    title: '页面不存在 | PicSpeak',
    heading: '404 — 页面不存在',
    body: '你访问的 PicSpeak 页面不存在，可能已移动或被删除。',
    cta: '返回 PicSpeak',
  },
  en: {
    title: 'Page not found | PicSpeak',
    heading: '404 — Page not found',
    body: 'The requested PicSpeak page does not exist.',
    cta: 'Back to PicSpeak',
  },
  ja: {
    title: 'ページが見つかりません | PicSpeak',
    heading: '404 — ページが見つかりません',
    body: '指定された PicSpeak ページは存在しません。',
    cta: 'PicSpeak に戻る',
  },
};

function htmlLang(locale: SupportedLocale): string {
  return locale === 'zh' ? 'zh-CN' : locale;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const PUBLIC_PROFILE_PATH = /^\/u\/([^/]+)\/?$/;

/**
 * A rendered `notFound()` cannot change an already streamed 200, so document
 * requests for a profile the backend definitively reports missing get the
 * early 404 here. Outages and network errors fall through to the page.
 */
async function isMissingPublicProfile(request: { method: string; headers: Headers; nextUrl: URL }): Promise<boolean> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  // Client router (RSC) navigations render the layout's not-found UI instead.
  if (request.headers.get('rsc') || request.headers.get('next-router-prefetch')) return false;
  const match = request.nextUrl.pathname.match(PUBLIC_PROFILE_PATH);
  if (!match) return false;
  let publicProfileId: string;
  try {
    publicProfileId = decodeURIComponent(match[1]);
  } catch {
    return true;
  }
  return (await lookupPublicProfile(publicProfileId)).state === 'missing';
}

function unknownRouteResponse(locale: SupportedLocale): NextResponse {
  const copy = NOT_FOUND_COPY[locale];
  return new NextResponse(
    `<!doctype html><html lang="${htmlLang(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(copy.title)}</title></head><body><main><h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.body)}</p><a href="/${locale}">${escapeHtml(copy.cta)}</a></main></body></html>`,
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
  async (_auth, request) => {
    const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    const locale = resolveRequestLocale(
      request.nextUrl.pathname,
      cookieLocale,
      request.headers.get('accept-language'),
    );
    const hasExplicitLocalePath = Boolean(request.nextUrl.pathname.match(/^\/(zh|en|ja)(?:\/|$)/));
    if (!hasKnownAppPath(request.nextUrl.pathname) || await isMissingPublicProfile(request)) {
      return unknownRouteResponse(locale ?? 'en');
    }

    const requestHeaders = new Headers(request.headers);
    requestHeaders.delete('x-picspeak-locale');

    const blogRedirectPath = getLocalizedBlogRedirectPath(
      request.nextUrl.pathname,
      locale ?? 'en',
    );

    if (blogRedirectPath) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = blogRedirectPath;
      const response = NextResponse.redirect(redirectUrl, 307);
      response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      response.headers.set('Vary', 'Cookie, Accept-Language');
      return response;
    }

    if (locale) {
      requestHeaders.set('x-picspeak-locale', locale);
    }
    const response = NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
    if (locale && !hasExplicitLocalePath) {
      response.headers.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
      response.headers.set('Vary', 'Cookie, Accept-Language');
    }
    return response;
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
