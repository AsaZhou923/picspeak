import { clerkMiddleware } from '@clerk/nextjs/server';

import { siteConfig } from '@/lib/site';

const productionOrigin = new URL(siteConfig.url).origin;
const productionWwwOrigin = productionOrigin.includes('://www.')
  ? productionOrigin
  : productionOrigin.replace('://', '://www.');

const authorizedParties = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      productionOrigin,
      productionWwwOrigin,
      process.env.NEXT_PUBLIC_SITE_URL,
    ].filter((value): value is string => Boolean(value?.trim()))
  )
);

export default clerkMiddleware({
  authorizedParties,
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
