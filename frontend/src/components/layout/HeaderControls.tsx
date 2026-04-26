'use client';

import Link from 'next/link';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { BadgeDollarSign, ChevronDown, ChevronRight, Clock, Heart, Moon, Sun, Wand2 } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { planColor, planLabel } from '@/lib/auth-context';
import useOnClickOutside from '@/lib/hooks/useOnClickOutside';
import { LOCALE_LABELS, Locale, useI18n } from '@/lib/i18n';
import { useTheme } from '@/lib/theme-context';
import type { HeaderVisibilityState } from './header-auth-visibility';

const AUTH_LABELS: Record<Locale, { signIn: string; signUp: string }> = {
  zh: { signIn: '登录', signUp: '注册' },
  en: { signIn: 'Sign in', signUp: 'Sign up' },
  ja: { signIn: 'サインイン', signUp: '新規登録' },
};

const LOCALE_PREFIXES: readonly string[] = ['zh', 'en', 'ja'];

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useOnClickOutside(ref, () => setOpen(false));

  const handleSwitch = (nextLocale: Locale) => {
    setLocale(nextLocale);
    setOpen(false);

    const segments = pathname.split('/');
    if (segments.length >= 2 && LOCALE_PREFIXES.includes(segments[1])) {
      segments[1] = nextLocale;
      router.push(segments.join('/'));
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 text-sm text-ink-muted hover:text-ink transition-colors px-2 py-1 rounded"
        aria-label="Switch language"
      >
        {LOCALE_LABELS[locale]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-28 border border-border-subtle rounded-md bg-void shadow-lg z-50 overflow-hidden">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((item) => (
            <button
              key={item}
              onClick={() => handleSwitch(item)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
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
    ...(userInfo && userInfo.plan !== 'guest' ? [{ href: '/account/generations', label: t('generation_history_nav'), icon: Wand2 }] : []),
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
  const visibleUserInfo = headerVisibility.userInfo;
  const authLabels = AUTH_LABELS[locale];
  const isLegacyAuthenticated = Boolean(
    visibleUserInfo && visibleUserInfo.plan !== 'guest' && visibleUserInfo.auth_provider !== 'clerk'
  );

  const handleLogout = () => {
    logout();
    router.push('/workspace');
  };

  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 ${className}`}>
      <LanguageSwitcher />

      <button
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? t('theme_dark') : t('theme_light')}
        className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-gold transition-colors"
      >
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
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
  );
}
