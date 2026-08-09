'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { BookOpen, Camera, LayoutGrid, Repeat2, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { HeaderRightControls } from './HeaderControls';
import { getHeaderVisibilityState } from './header-auth-visibility';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';

const MARKETING_LINKS: Array<
  | { href: string; key: 'nav_home' | 'nav_workspace' | 'nav_generate' | 'nav_gallery' | 'nav_usage' }
  | { href: string; kind: 'retake' }
  | { kind: 'blog' }
> = [
  { href: '/', key: 'nav_home' },
  { href: '/workspace', key: 'nav_workspace' },
  { href: '/retake', kind: 'retake' },
  { href: '/generate', key: 'nav_generate' },
  { href: '/gallery', key: 'nav_gallery' },
  { kind: 'blog' },
  { href: '/account/usage', key: 'nav_usage' },
];

const MOBILE_MARKETING_LINKS: Array<{
  href: string;
  key?: 'nav_workspace' | 'nav_generate_short' | 'nav_gallery';
  kind?: 'retake';
  icon: typeof Camera;
}> = [
  { href: '/workspace', key: 'nav_workspace', icon: Camera },
  { href: '/retake', kind: 'retake', icon: Repeat2 },
  { href: '/generate', key: 'nav_generate_short', icon: Wand2 },
  { href: '/gallery', key: 'nav_gallery', icon: LayoutGrid },
];

export default function MarketingHeader() {
  const { userInfo } = useAuth();
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const retakeCopy = getRetakeCoachCopy(locale);
  const homeHref = `/${locale}`;
  const [hasHydrated, setHasHydrated] = useState(false);
  const normalizedPathname = pathname?.replace(/^\/(zh|en|ja)(?=\/|$)/, '') || '/';

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const headerVisibility = getHeaderVisibilityState({
    hasHydrated,
    userInfo,
  });

  const isActive = (href: string) =>
    href === '/'
      ? normalizedPathname === href
      : normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);

  const activeClass = (href: string) =>
    isActive(href)
      ? 'text-gold'
      : 'text-ink-muted hover:text-ink';

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-xl">
      <div className="max-w-editorial mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={homeHref}
            className="flex items-center gap-2 text-ink hover:text-gold transition-colors shrink-0"
          >
            <Image
              src="/logo.png"
              alt="PicSpeak"
              width={28}
              height={28}
              className="rounded object-contain"
              priority
            />
            <span className="font-display text-lg tracking-wide hidden lg:inline">PicSpeak</span>
          </Link>
          <Link
            href={homeHref}
            className={`md:hidden flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              isActive('/')
                ? 'bg-gold/10 text-gold'
                : 'bg-raised/55 text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {t('nav_home')}
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-4 text-[13px] lg:gap-6 lg:text-sm">
          {MARKETING_LINKS.map((link) => {
            const href =
              'kind' in link && link.kind === 'blog'
                ? `/${locale}/blog`
                : link.href === '/'
                  ? homeHref
                  : link.href;
            const activeHref =
              'kind' in link && link.kind === 'blog' ? '/blog' : link.href;
            return (
              <Link key={href} href={href} className={`transition-colors ${activeClass(activeHref)}`}>
                {'key' in link ? t(link.key) : link.kind === 'retake' ? retakeCopy.nav : blogUi.navLabel}
              </Link>
            );
          })}
        </nav>

        <HeaderRightControls headerVisibility={headerVisibility} className="shrink-0" />
      </div>
      <div className="md:hidden border-t border-border-subtle/40 px-3 py-2">
        <nav className="flex items-stretch rounded-card bg-surface/70 p-1 gap-0.5">
          {MOBILE_MARKETING_LINKS.map(({ href, key, kind, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-control py-2 text-[10px] font-medium transition-all duration-200 ${
                isActive(href)
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Icon size={14} />
              <span className="tracking-wide">{kind === 'retake' ? retakeCopy.navShort : t(key!)}</span>
            </Link>
          ))}
          <Link
            href={`/${locale}/blog`}
            className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-control py-2 text-[10px] font-medium transition-all duration-200 ${
              isActive('/blog')
                ? 'bg-void shadow-sm text-gold'
                : 'text-ink-subtle hover:text-ink-muted active:scale-95'
            }`}
          >
            <BookOpen size={14} />
            <span className="tracking-wide">{blogUi.navLabel}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
