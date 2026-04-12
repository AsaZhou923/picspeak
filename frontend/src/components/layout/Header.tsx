'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Sun, Moon, ChevronDown, Camera, Clock, BarChart2, BadgeDollarSign, LayoutGrid, ChevronRight, Heart, BookOpen } from 'lucide-react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { getBlogUi } from '@/lib/blog-data';
import { useTheme } from '@/lib/theme-context';
import { useI18n, LOCALE_LABELS, Locale } from '@/lib/i18n';
import { useState, useRef, useEffect } from 'react';
import useOnClickOutside from '@/lib/hooks/useOnClickOutside';

const AUTH_LABELS: Record<Locale, { signIn: string; signUp: string }> = {
  zh: { signIn: '登录', signUp: '注册' },
  en: { signIn: 'Sign in', signUp: 'Sign up' },
  ja: { signIn: 'サインイン', signUp: '新規登録' },
};

const LOCALE_PREFIXES: readonly string[] = ['zh', 'en', 'ja'];

function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  const handleSwitch = (l: Locale) => {
    setLocale(l);
    setOpen(false);

    // If we're on a locale-prefixed route, navigate to the equivalent URL
    // under the new locale so the inner I18nProvider picks up the change.
    const segments = pathname.split('/');
    if (segments.length >= 2 && LOCALE_PREFIXES.includes(segments[1])) {
      segments[1] = l;
      router.push(segments.join('/'));
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors px-2 py-1 rounded"
        aria-label="Switch language"
      >
        {LOCALE_LABELS[locale]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-28 border border-border-subtle rounded-md bg-void shadow-lg z-50 overflow-hidden">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((l) => (
            <button
              key={l}
              onClick={() => handleSwitch(l)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${locale === l ? 'text-gold bg-gold/5' : 'text-ink-muted hover:text-ink hover:bg-raised'}`}
            >
              {LOCALE_LABELS[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


function QuickLinksMenu() {
  const pathname = usePathname();
  const { t, locale } = useI18n();
  const { userInfo } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const favoritesLabel =
    locale === 'ja' ? 'お気に入り' : locale === 'en' ? 'Favorites' : '我的收藏';

  const links = [
    { href: '/account/favorites', label: favoritesLabel, icon: Heart },
    ...(userInfo && userInfo.plan !== 'guest' ? [{ href: '/account/reviews', label: t('nav_history'), icon: Clock }] : []),
    { href: '/affiliate', label: t('nav_affiliate'), icon: BadgeDollarSign },
  ] as Array<{
    href: string;
    label: string;
    icon: typeof Heart;
    className?: string;
  }>;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('nav_more')}
        aria-expanded={open}
        className={`flex h-8 items-center gap-1 rounded-full border border-border-subtle bg-raised/55 px-2.5 text-xs text-ink-muted transition-all hover:border-gold/30 hover:text-gold ${
          open ? 'border-gold/40 text-gold' : ''
        }`}
      >
        <span className="hidden sm:inline">{t('nav_more')}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-2xl border border-border-subtle bg-void/95 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          {links.map(({ href, label, icon: Icon, className }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`${className ?? ''} flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'bg-gold/10 text-gold'
                    : 'text-ink-muted hover:bg-raised hover:text-ink'
                }`}
              >
                <Icon size={15} />
                <span className="flex-1">{label}</span>
                <ChevronRight size={13} className="opacity-60" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const { userInfo, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const authLabels = AUTH_LABELS[locale];
  const isLegacyAuthenticated = Boolean(
    userInfo && userInfo.plan !== 'guest' && userInfo.auth_provider !== 'clerk'
  );

  const isActive = (href: string) =>
    (href === '/' ? pathname === href : pathname === href || pathname?.startsWith(`${href}/`))
      ? 'text-gold'
      : 'text-ink-muted hover:text-ink';

  const handleLogout = () => {
    logout();
    router.push('/workspace');
  };

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
          <Link href="/gallery" className={`transition-colors ${isActive('/gallery')}`}>
            {t('nav_gallery')}
          </Link>
          <Link href={`/${locale}/blog`} className={`transition-colors ${isActive(`/${locale}/blog`)}`}>
            {blogUi.navLabel}
          </Link>
          {userInfo && (
            <Link href="/account/usage" className={`transition-colors ${isActive('/account/usage')}`}>
              {t('nav_usage')}
            </Link>
          )}
        </nav>

        {/* Right: lang + theme + identity */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Language switcher */}
          <LanguageSwitcher />

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('theme_dark') : t('theme_light')}
            className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-gold transition-colors"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>

          {userInfo ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 text-sm">
                <span className={`font-medium ${planColor(userInfo.plan)}`}>
                  {userInfo.plan === 'guest' ? t('plan_guest_label') : planLabel(userInfo.plan)}
                </span>
              </span>
              <QuickLinksMenu />

              {isLegacyAuthenticated ? (
                <>
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                  <button
                    onClick={handleLogout}
                    className="text-sm text-ink-subtle hover:text-ink transition-colors"
                  >
                    {t('logout')}
                  </button>
                </>
              ) : (
                <>
                  <Show when="signed-out">
                    <SignInButton mode="modal" fallbackRedirectUrl="/workspace">
                      <button
                        type="button"
                        className="px-2.5 sm:px-3 py-1.5 text-sm border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors whitespace-nowrap"
                      >
                        {authLabels.signIn}
                      </button>
                    </SignInButton>
                    <SignUpButton mode="modal" fallbackRedirectUrl="/workspace">
                      <button
                        type="button"
                        className="hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 text-sm border border-border text-ink-muted rounded hover:border-gold/40 hover:text-gold transition-colors whitespace-nowrap"
                      >
                        {authLabels.signUp}
                      </button>
                    </SignUpButton>
                  </Show>
                  <Show when="signed-in">
                    <UserButton />
                  </Show>
                </>
              )}
            </div>
          ) : (
            <>
              <QuickLinksMenu />
              <Show when="signed-out">
                <SignInButton mode="modal" fallbackRedirectUrl="/workspace">
                  <button
                    type="button"
                    className="px-2.5 sm:px-3 py-1.5 text-sm border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors whitespace-nowrap"
                  >
                    {authLabels.signIn}
                  </button>
                </SignInButton>
                <SignUpButton mode="modal" fallbackRedirectUrl="/workspace">
                  <button
                    type="button"
                    className="hidden sm:inline-flex px-2.5 sm:px-3 py-1.5 text-sm border border-border text-ink-muted rounded hover:border-gold/40 hover:text-gold transition-colors whitespace-nowrap"
                  >
                    {authLabels.signUp}
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </>
          )}
        </div>
      </div>

      {userInfo && (
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
