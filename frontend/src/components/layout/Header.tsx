'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Sun, Moon, ChevronDown, Camera, Clock, BarChart2 } from 'lucide-react';
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import { useI18n, LOCALE_LABELS, Locale } from '@/lib/i18n';
import { useState, useRef, useEffect } from 'react';

const AUTH_LABELS: Record<Locale, { signIn: string; signUp: string }> = {
  zh: { signIn: '登录', signUp: '注册' },
  en: { signIn: 'Sign in', signUp: 'Sign up' },
  ja: { signIn: 'サインイン', signUp: '新規登録' },
};

function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
              onClick={() => { setLocale(l); setOpen(false); }}
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

export default function Header() {
  const { userInfo, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useI18n();
  const authLabels = AUTH_LABELS[locale];
  const isLegacyAuthenticated = Boolean(
    userInfo && userInfo.plan !== 'guest' && userInfo.auth_provider !== 'clerk'
  );

  const isActive = (href: string) =>
    pathname === href ? 'text-gold' : 'text-ink-muted hover:text-ink';

  const handleLogout = () => {
    logout();
    router.push('/workspace');
    router.refresh();
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo */}
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

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/" className={`transition-colors ${isActive('/')}`}>
            {t('nav_home')}
          </Link>
          <Link href="/workspace" className={`transition-colors ${isActive('/workspace')}`}>
            {t('nav_workspace')}
          </Link>
          {userInfo && (
            <>
              {userInfo.plan !== 'guest' && (
                <Link href="/account/reviews" className={`transition-colors ${isActive('/account/reviews')}`}>
                  {t('nav_history')}
                </Link>
              )}
              <Link href="/account/usage" className={`transition-colors ${isActive('/account/usage')}`}>
                {t('nav_usage')}
              </Link>
            </>
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
            {userInfo.plan !== 'guest' && (
              <Link
                href="/account/reviews"
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-2 rounded-[10px] text-[10px] font-medium transition-all duration-200 ${
                  pathname === '/account/reviews'
                    ? 'bg-void shadow-sm text-gold'
                    : 'text-ink-subtle hover:text-ink-muted active:scale-95'
                }`}
              >
                <Clock size={14} />
                <span className="tracking-wide">{t('nav_history')}</span>
              </Link>
            )}
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
          </nav>
        </div>
      )}
    </header>
  );
}
