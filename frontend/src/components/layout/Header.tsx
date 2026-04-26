'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Camera, BarChart2, LayoutGrid, BookOpen, Wand2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';
import { useState, useEffect } from 'react';
import { HeaderRightControls } from './HeaderControls';
import { getHeaderVisibilityState } from './header-auth-visibility';

export default function Header() {
  const { userInfo } = useAuth();
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const headerVisibility = getHeaderVisibilityState({
    hasHydrated,
    userInfo,
  });

  const isActive = (href: string) =>
    (href === '/' ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`))
      ? 'text-gold'
      : 'text-ink-muted hover:text-ink';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Left side: Logo and Mobile Home */}
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-ink hover:text-gold transition-colors"
          >
            <Image
              src="/logo.png"
              alt="PicSpeak"
              width={28}
              height={28}
              className="rounded object-contain"
              priority
            />
            <span className="font-display text-lg tracking-wide hidden xs:inline sm:inline">PicSpeak</span>
          </Link>
          <Link 
            href="/" 
            className={`md:hidden flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              pathname === '/' 
                ? 'bg-gold/10 text-gold' 
                : 'bg-raised/55 text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {t('nav_home')}
          </Link>
        </div>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/" className={`transition-colors ${isActive('/')}`}>
            {t('nav_home')}
          </Link>
          <Link href="/workspace" className={`transition-colors ${isActive('/workspace')}`}>
            {t('nav_workspace')}
          </Link>
          <Link href="/generate" className={`transition-colors ${isActive('/generate')}`}>
            {t('nav_generate')}
          </Link>
          <Link href="/gallery" className={`transition-colors ${isActive('/gallery')}`}>
            {t('nav_gallery')}
          </Link>
          <Link href={`/${locale}/blog`} className={`transition-colors ${isActive(`/${locale}/blog`)}`}>
            {blogUi.navLabel}
          </Link>
          {headerVisibility.showUsageNav && (
            <Link href="/account/usage" className={`transition-colors ${isActive('/account/usage')}`}>
              {t('nav_usage')}
            </Link>
          )}
        </nav>

        <HeaderRightControls headerVisibility={headerVisibility} />
      </div>

      {headerVisibility.showMobileTabs && (
        <div className="md:hidden border-t border-border-subtle/40 px-3 py-2">
          <nav className="flex items-stretch bg-surface/70 rounded-xl p-1 gap-0.5">
            <Link
              href="/workspace"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                pathname === '/workspace'
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Camera size={14} />
              <span className="tracking-wide">{t('nav_workspace')}</span>
            </Link>
            <Link
              href="/gallery"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                pathname === '/gallery'
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <LayoutGrid size={14} />
              <span className="tracking-wide">{t('nav_gallery')}</span>
            </Link>
            <Link
              href="/generate"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                pathname === '/generate'
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Wand2 size={14} />
              <span className="tracking-wide">{t('nav_generate_short')}</span>
            </Link>
            <Link
              href="/account/usage"
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                pathname === '/account/usage'
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <BarChart2 size={14} />
              <span className="tracking-wide">{t('nav_usage')}</span>
            </Link>
            <Link
              href={`/${locale}/blog`}
              className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                pathname === `/${locale}/blog` || pathname?.startsWith(`/${locale}/blog/`)
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <BookOpen size={14} />
              <span className="tracking-wide">{blogUi.navLabel}</span>
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
