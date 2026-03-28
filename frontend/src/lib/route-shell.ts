export function isMarketingRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;

  return (
    pathname.startsWith('/affiliate') ||
    pathname.startsWith('/updates') ||
    pathname.startsWith('/share') ||
    pathname.startsWith('/error')
  );
}
