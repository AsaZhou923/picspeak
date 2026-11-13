'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Camera, LayoutGrid, Repeat2, Target, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';
import { useState, useEffect } from 'react';
import { HeaderRightControls } from './HeaderControls';
import { getHeaderVisibilityState } from './header-auth-visibility';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import { usePracticeEnabled } from '@/features/practice/usePracticeEnabled';

export default function Header() {
  const { userInfo } = useAuth();
  const practiceEnabled = usePracticeEnabled();
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const retakeCopy = getRetakeCoachCopy(locale);
  const homeHref = `/${locale}`;
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const headerVisibility = getHeaderVisibilityState({
    hasHydrated,
    userInfo,
  });

  const homeActive = pathname === '/' || pathname === homeHref;
  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
  const desktopLinkClass = (active: boolean) =>
    `whitespace-nowrap transition-colors ${active
      ? 'font-semibold text-gold underline decoration-gold decoration-2 underline-offset-8'
      : 'text-ink-muted hover:text-ink'}`;

  return (
    <header className="sticky top-0 z-50 border-b border-border-subtle bg-void">
      <div className="max-w-editorial mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left side: Logo and Mobile Home */}
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={homeHref}
            aria-label="PicSpeak"
            className="flex items-center gap-2 text-ink hover:text-gold transition-colors"
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
            className={`md:hidden flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              homeActive
                ? 'bg-gold/10 text-gold' 
                : 'bg-raised/55 text-ink-muted hover:bg-raised hover:text-ink'
            }`}
            aria-current={homeActive ? 'page' : undefined}
          >
            {t('nav_home')}
          </Link>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-3 text-[13px] lg:gap-5 xl:gap-6 xl:text-sm">
          <Link href={homeHref} aria-current={homeActive ? 'page' : undefined} className={desktopLinkClass(homeActive)}>
            {t('nav_home')}
          </Link>
          <Link href="/workspace" aria-current={isActive('/workspace') ? 'page' : undefined} className={desktopLinkClass(isActive('/workspace'))}>
            {t('nav_critique')}
          </Link>
          {practiceEnabled === true && <Link href="/account/practice" aria-current={isActive('/account/practice') ? 'page' : undefined} className={desktopLinkClass(isActive('/account/practice'))}>
            {t('nav_practice')}
          </Link>}
          <Link href="/generate" aria-current={isActive('/generate') ? 'page' : undefined} className={desktopLinkClass(isActive('/generate'))}>
            {t('nav_generate')}
          </Link>
          <Link href="/gallery" aria-current={isActive('/gallery') ? 'page' : undefined} className={desktopLinkClass(isActive('/gallery'))}>
            {t('nav_gallery')}
          </Link>
          <Link href={`/${locale}/blog`} aria-current={isActive(`/${locale}/blog`) ? 'page' : undefined} className={desktopLinkClass(isActive(`/${locale}/blog`))}>
            {blogUi.navLabel}
          </Link>
          {headerVisibility.showUsageNav && (
            <Link href="/account/usage" aria-current={isActive('/account/usage') ? 'page' : undefined} className={desktopLinkClass(isActive('/account/usage'))}>
              {t('nav_usage')}
            </Link>
          )}
        </nav>

        <HeaderRightControls headerVisibility={headerVisibility} className="shrink-0" />
      </div>

      {headerVisibility.showMobileTabs && (
        <div className="md:hidden fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface px-2 pb-[env(safe-area-inset-bottom)]">
          <nav className="flex items-stretch">
            <Link
              href="/workspace"
              aria-current={isActive('/workspace') ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive('/workspace')
                  ? 'font-semibold text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Camera size={18} aria-hidden="true" />
              <span className="tracking-wide">{t('nav_critique')}</span>
            </Link>
            <Link
              href="/gallery"
              aria-current={isActive('/gallery') ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive('/gallery')
                  ? 'font-semibold text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <LayoutGrid size={18} aria-hidden="true" />
              <span className="tracking-wide">{t('nav_gallery')}</span>
            </Link>
            <Link
              href="/retake"
              aria-current={isActive('/retake') ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive('/retake')
                  ? 'bg-void shadow-sm text-sage'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Repeat2 size={18} aria-hidden="true" />
              <span className="tracking-wide">{retakeCopy.navShort}</span>
            </Link>
            <Link
              href="/generate"
              aria-current={isActive('/generate') ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive('/generate')
                  ? 'font-semibold text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Wand2 size={18} aria-hidden="true" />
              <span className="tracking-wide">{t('nav_generate_short')}</span>
            </Link>
            {practiceEnabled === true && <Link
              href="/account/practice"
              aria-current={isActive('/account/practice') ? 'page' : undefined}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[3.5rem] py-2 text-[11px] font-medium transition-all duration-200 ${
                isActive('/account/practice')
                  ? 'font-semibold text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Target size={18} aria-hidden="true" />
              <span className="tracking-wide">{t('nav_practice')}</span>
            </Link>}
          </nav>
        </div>
      )}
    </header>
  );
}
