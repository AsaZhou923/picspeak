const LOCALE_PREFIX = /^\/(zh|en|ja)(?=\/|$)/;

function stripLocalePrefix(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX, '');
  return stripped.length > 0 ? stripped : '/';
}

export function isMarketingRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  const normalized = stripLocalePrefix(pathname);

  return (
    normalized === '/' ||
    normalized.startsWith('/affiliate') ||
    normalized.startsWith('/blog') ||
    normalized.startsWith('/updates') ||
    normalized.startsWith('/share') ||
    normalized.startsWith('/error')
  );
}
