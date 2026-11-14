'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Camera, LayoutGrid, Repeat2, Target, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';
import { useEffect, useState } from 'react';
import { HeaderRightControls } from './HeaderControls';
import { getHeaderVisibilityState } from './header-auth-visibility';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import { usePracticeEnabled } from '@/features/practice/usePracticeEnabled';

const MARKETING_LINKS: Array<
  | { href: string; key: 'nav_home' | 'nav_critique' | 'nav_practice' | 'nav_generate' | 'nav_gallery' | 'nav_usage' }
  | { kind: 'blog' }
> = [
  { href: '/', key: 'nav_home' },
  { href: '/workspace', key: 'nav_critique' },
  { href: '/account/practice', key: 'nav_practice' },
  { href: '/generate', key: 'nav_generate' },
  { href: '/gallery', key: 'nav_gallery' },
  { kind: 'blog' },
  { href: '/account/usage', key: 'nav_usage' },
];

const MOBILE_MARKETING_LINKS: Array<{
  href: string;
  key?: 'nav_critique' | 'nav_generate_short' | 'nav_gallery' | 'nav_practice';
  kind?: 'retake';
  icon: typeof Camera;
}> = [
  // Same order as the app header's mobile tabs, so tabs do not move between pages.
  { href: '/workspace', key: 'nav_critique', icon: Camera },
  { href: '/gallery', key: 'nav_gallery', icon: LayoutGrid },
  { href: '/retake', kind: 'retake', icon: Repeat2 },
  { href: '/generate', key: 'nav_generate_short', icon: Wand2 },
  { href: '/account/practice', key: 'nav_practice', icon: Target },
];

export default function MarketingHeader() {
  const { userInfo } = useAuth();
  const practiceEnabled = usePracticeEnabled();
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
      ? 'whitespace-nowrap font-semibold text-gold underline decoration-gold decoration-2 underline-offset-8'
      : 'whitespace-nowrap text-ink-muted hover:text-ink';

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-void">
      <div className="max-w-editorial mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={homeHref}
            aria-label="PicSpeak"
            className="flex items-center gap-2 text-ink hover:text-gold transition-colors shrink-0"
          >
            <Image
              src="/brand-mark.svg"
              alt=""
              width={28}
              height={28}
              className="rounded object-contain"
              priority
            />
            <span className="font-display text-lg font-black hidden lg:inline">PicSpeak</span>
          </Link>
          <Link
            href={homeHref}
            aria-current={isActive('/') ? 'page' : undefined}
            className={`md:hidden flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              isActive('/')
                ? 'bg-gold/10 text-gold'
                : 'bg-raised/55 text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {t('nav_home')}
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-3 text-[13px] lg:gap-5 xl:gap-6 xl:text-sm">
          {MARKETING_LINKS.map((link) => {
            if ('href' in link && link.href === '/account/practice' && practiceEnabled !== true) return null;
            if (!('href' in link)) {
              return (
                <Link key="blog" href={`/${locale}/blog`} aria-current={isActive('/blog') ? 'page' : undefined} className={`transition-colors ${activeClass('/blog')}`}>
                  {blogUi.navLabel}
                </Link>
              );
            }

            const href = link.href === '/' ? homeHref : link.href;
            return (
              <Link key={href} href={href} aria-current={isActive(link.href) ? 'page' : undefined} className={`transition-colors ${activeClass(link.href)}`}>
                {t(link.key)}
              </Link>
            );
          })}
        </nav>

        <HeaderRightControls headerVisibility={headerVisibility} className="shrink-0" />
      </div>
      <div className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface px-2 pb-[env(safe-area-inset-bottom)]">
        <nav className="flex items-stretch">
          {MOBILE_MARKETING_LINKS.filter((link) => link.href !== '/account/practice' || practiceEnabled === true).map(({ href, key, kind, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive(href)
                  ? 'font-semibold text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Icon size={18} aria-hidden="true" />
              <span className="tracking-wide">{kind === 'retake' ? retakeCopy.navShort : t(key!)}</span>
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
