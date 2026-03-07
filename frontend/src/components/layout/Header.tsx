'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Sun, Moon, ChevronDown } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { buildGoogleOAuthUrl } from '@/lib/api';
import { useTheme } from '@/lib/theme-context';
import { useI18n, LOCALE_LABELS, Locale } from '@/lib/i18n';
import { useState, useRef, useEffect } from 'react';

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
  const { theme, toggleTheme } = useTheme();
  const { t } = useI18n();

  const isActive = (href: string) =>
    pathname === href ? 'text-gold' : 'text-ink-muted hover:text-ink';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
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
          <span className="font-display text-lg tracking-wide">PicSpeak</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/workspace" className={`transition-colors ${isActive('/workspace')}`}>
            {t('nav_workspace')}
          </Link>
          {userInfo && (
            <>
              <Link href="/account/reviews" className={`transition-colors ${isActive('/account/reviews')}`}>
                {t('nav_history')}
              </Link>
              <Link href="/account/usage" className={`transition-colors ${isActive('/account/usage')}`}>
                {t('nav_usage')}
              </Link>
            </>
          )}
        </nav>

        {/* Right: lang + theme + identity */}
        <div className="flex items-center gap-2">
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

              {userInfo.plan === 'guest' ? (
                <a
                  href={buildGoogleOAuthUrl()}
                  className="px-3 py-1.5 text-sm border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors"
                >
                  {t('login_google')}
                </a>
              ) : (
                <button
                  onClick={logout}
                  className="text-sm text-ink-subtle hover:text-ink transition-colors"
                >
                  {t('logout')}
                </button>
              )}
            </div>
          ) : (
            <a
              href={buildGoogleOAuthUrl()}
              className="px-3 py-1.5 text-sm border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors"
            >
              {t('login_google')}
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
