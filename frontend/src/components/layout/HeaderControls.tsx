'use client';

import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { BadgeDollarSign, ChevronDown, ChevronRight, Clock, Heart, Moon, Repeat2, Sun, UserRound, Wand2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { planColor, planLabel } from '@/lib/auth-context';
import useOnClickOutside from '@/lib/hooks/useOnClickOutside';
import { LOCALE_LABELS, Locale, useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import type { HeaderVisibilityState } from './header-auth-visibility';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';

const AUTH_LABELS: Record<Locale, { signIn: string; signUp: string }> = {
  zh: { signIn: '登录', signUp: '注册' },
  en: { signIn: 'Sign in', signUp: 'Sign up' },
  ja: { signIn: 'サインイン', signUp: '新規登録' },
};

const LOCALE_PREFIXES: readonly string[] = ['zh', 'en', 'ja'];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  const handleSwitch = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setOpen(false);
    triggerRef.current?.focus();

    const segments = pathname.split('/');
    if (segments.length >= 2 && LOCALE_PREFIXES.includes(segments[1])) {
      segments[1] = nextLocale;
      router.push(segments.join('/'));
    } else {
      router.refresh();
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={handleMenuKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-11 items-center gap-1 rounded-control px-2 text-sm text-ink-muted transition-colors hover:text-ink"
        aria-label={t('language_switcher_label')}
        aria-expanded={open}
        aria-controls="header-language-options"
      >
        {LOCALE_LABELS[locale]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div id="header-language-options" aria-label={t('language_switcher_label')} role="group" className="absolute right-0 top-full z-50 mt-1.5 w-28 overflow-hidden rounded-card border border-border-subtle bg-void shadow-level-3">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((item) => (
            <button
              key={item}
              onClick={() => handleSwitch(item)}
              aria-pressed={locale === item}
              className={`min-h-11 w-full px-3 py-2 text-left text-sm transition-colors ${
                locale === item ? 'text-gold bg-gold/5' : 'text-ink-muted hover:text-ink hover:bg-raised'
              }`}
            >
              {LOCALE_LABELS[item]}
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
  const retakeCopy = getRetakeCoachCopy(locale);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  const links = [
    { href: '/account/favorites', label: t('review_nav_favorites'), icon: Heart },
    { href: '/retake', label: retakeCopy.nav, icon: Repeat2 },
    ...(userInfo && userInfo.plan !== 'guest' ? [{ href: '/account/reviews', label: t('nav_history'), icon: Clock }] : []),
    ...(userInfo && userInfo.plan !== 'guest' ? [{ href: '/account/generations', label: t('generation_history_nav'), icon: Wand2 }] : []),
    ...(userInfo && userInfo.plan !== 'guest' ? [{
      href: '/account/profile',
      label: locale === 'zh' ? '公开作品主页' : locale === 'ja' ? '公開作品プロフィール' : 'Public portfolio',
      icon: UserRound,
    }] : []),
    { href: '/affiliate', label: t('nav_affiliate'), icon: BadgeDollarSign },
  ] as Array<{
    href: string;
    label: string;
    icon: typeof Heart;
    className?: string;
  }>;

  return (
    <div ref={ref} className="relative" onKeyDown={handleMenuKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('nav_more')}
        aria-expanded={open}
        aria-controls="header-quick-links"
        className={`flex h-11 items-center gap-1 rounded-full border border-border-subtle bg-raised/55 px-2.5 text-sm text-ink-muted transition-all hover:border-gold/30 hover:text-gold ${
          open ? 'border-gold/40 text-gold' : ''
        }`}
      >
        <span className="hidden sm:inline">{t('nav_more')}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <nav id="header-quick-links" aria-label={t('nav_more')} className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-card border border-border-subtle bg-void/95 p-1.5 shadow-level-3 backdrop-blur-xl">
          {links.map(({ href, label, icon: Icon, className }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${className ?? ''} flex min-h-11 items-center gap-3 rounded-control px-3 py-2.5 text-sm transition-colors ${
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
        </nav>
      )}
    </div>
  );
}

export function HeaderRightControls({
  headerVisibility,
  className = '',
}: {
  headerVisibility: HeaderVisibilityState;
  className?: string;
}) {
  const { logout } = useAuth();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useI18n();
  const [themeControlMounted, setThemeControlMounted] = useState(false);
  const visibleUserInfo = headerVisibility.userInfo;
  const authLabels = AUTH_LABELS[locale];
  const isLegacyAuthenticated = Boolean(
    visibleUserInfo && visibleUserInfo.plan !== 'guest' && visibleUserInfo.auth_provider !== 'clerk'
  );

  const handleLogout = () => {
    logout();
    router.push('/workspace');
  };

  useEffect(() => {
    setThemeControlMounted(true);
  }, []);

  const renderedTheme = themeControlMounted ? theme : 'dark';

  return (
    <div className={`flex h-11 items-center gap-1.5 sm:gap-2 ${className}`}>
      <LanguageSwitcher />

      <button
        onClick={toggleTheme}
        aria-label={renderedTheme === 'dark' ? t('theme_dark') : t('theme_light')}
        className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted transition-colors hover:text-gold"
      >
        {renderedTheme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>

      {headerVisibility.showAuthenticatedControls ? (
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-sm">
            <span className={`font-medium ${planColor(visibleUserInfo!.plan)}`}>
              {visibleUserInfo!.plan === 'guest' ? t('plan_guest_label') : planLabel(visibleUserInfo!.plan)}
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
                    className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-control border border-gold/40 px-2.5 text-sm text-gold transition-colors hover:bg-gold/10 sm:px-3"
                  >
                    {authLabels.signIn}
                  </button>
                </SignInButton>
                <SignUpButton mode="modal" fallbackRedirectUrl="/workspace">
                  <button
                    type="button"
                    className="hidden h-11 items-center justify-center whitespace-nowrap rounded-control border border-border px-2.5 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-gold sm:inline-flex sm:px-3"
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
                className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-control border border-gold/40 px-2.5 text-sm text-gold transition-colors hover:bg-gold/10 sm:px-3"
              >
                {authLabels.signIn}
              </button>
            </SignInButton>
            <SignUpButton mode="modal" fallbackRedirectUrl="/workspace">
              <button
                type="button"
                className="hidden h-11 items-center justify-center whitespace-nowrap rounded-control border border-border px-2.5 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-gold sm:inline-flex sm:px-3"
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
  );
}
