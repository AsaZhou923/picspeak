/** Supported locale-prefixed home routes (e.g. /zh, /en, /ja). */
const LOCALE_HOME_ROUTES = new Set(['/zh', '/en', '/ja']);

export function isMarketingRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  // Exact locale-prefixed home pages (no trailing content)
  if (LOCALE_HOME_ROUTES.has(pathname)) return true;

  return (
    pathname.startsWith('/affiliate') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/updates') ||
    pathname.startsWith('/share') ||
    pathname.startsWith('/error')
  );
}
