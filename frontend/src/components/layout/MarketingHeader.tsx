'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme-context';
import { LOCALE_LABELS, Locale, useI18n } from '@/lib/i18n';

const MARKETING_LINKS: Array<{ href: string; key: 'nav_home' | 'nav_workspace' | 'nav_gallery' | 'nav_affiliate' }> = [
  { href: '/', key: 'nav_home' },
  { href: '/workspace', key: 'nav_workspace' },
  { href: '/gallery', key: 'nav_gallery' },
  { href: '/affiliate', key: 'nav_affiliate' },
];

export default function MarketingHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { t, locale, setLocale } = useI18n();

  const activeClass = (href: string) =>
    pathname === href ? 'text-gold' : 'text-ink-muted hover:text-ink';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
        <Link
          href="/"
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
          <span className="font-display text-lg tracking-wide hidden xs:inline sm:inline">PicSpeak</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm min-w-0">
          {MARKETING_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={`transition-colors ${activeClass(link.href)}`}>
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <select
            aria-label="Switch language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="h-8 rounded border border-border-subtle bg-transparent px-2 text-xs text-ink-muted outline-none transition-colors hover:border-gold/30 hover:text-ink"
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((item) => (
              <option key={item} value={item} className="bg-void text-ink">
                {LOCALE_LABELS[item]}
              </option>
            ))}
          </select>
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('theme_dark') : t('theme_light')}
            className="w-8 h-8 flex items-center justify-center rounded border border-border-subtle text-ink-muted hover:border-gold/30 hover:text-gold transition-colors"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          <Link
            href="/workspace"
            className="hidden sm:inline-flex items-center rounded border border-gold/35 px-3 py-1.5 text-sm text-gold transition-colors hover:bg-gold/10"
          >
            {t('hero_cta_start')}
          </Link>
        </div>
      </div>
    </header>
  );
}
