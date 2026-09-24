export function isUpdateNoticeRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/' || /^\/(zh|en|ja)\/?$/.test(pathname) || /^\/gallery\/?$/.test(pathname);
}
