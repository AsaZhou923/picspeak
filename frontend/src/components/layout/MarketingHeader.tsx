'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { BadgeDollarSign, BookOpen, Camera, ChevronDown, LayoutGrid, Moon, Sun, Wand2 } from 'lucide-react';
import { getBlogUi } from '@/lib/blog-data';
import { useTheme } from '@/lib/theme-context';
import { LOCALE_LABELS, Locale, useI18n } from '@/lib/i18n';
import { useRef, useState } from 'react';
import useOnClickOutside from '@/lib/hooks/useOnClickOutside';

const MARKETING_LINKS: Array<
  | { href: string; key: 'nav_home' | 'nav_workspace' | 'nav_generate' | 'nav_gallery' | 'nav_affiliate' }
  | { href: string; label: string }
> = [
  { href: '/', key: 'nav_home' },
  { href: '/workspace', key: 'nav_workspace' },
  { href: '/generate', key: 'nav_generate' },
  { href: '/gallery', key: 'nav_gallery' },
  { href: '/blog', label: 'Blog' },
  { href: '/affiliate', key: 'nav_affiliate' },
];

const MOBILE_MARKETING_LINKS: Array<{
  href: string;
  key: 'nav_workspace' | 'nav_generate_short' | 'nav_gallery' | 'nav_affiliate';
  icon: typeof Camera;
}> = [
  { href: '/workspace', key: 'nav_workspace', icon: Camera },
  { href: '/generate', key: 'nav_generate_short', icon: Wand2 },
  { href: '/gallery', key: 'nav_gallery', icon: LayoutGrid },
  { href: '/affiliate', key: 'nav_affiliate', icon: BadgeDollarSign },
];

const LOCALE_PREFIXES: readonly string[] = ['zh', 'en', 'ja'];

function LanguageSwitcher() {
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
        className="flex h-8 items-center gap-1 rounded-full border border-border-subtle bg-raised/55 px-3 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
        aria-label="Switch language"
      >
        {LOCALE_LABELS[locale]}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-28 overflow-hidden rounded-2xl border border-border-subtle bg-void/95 p-1.5 shadow-[0_18px_48px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          {(Object.keys(LOCALE_LABELS) as Locale[]).map((item) => (
            <button
              key={item}
              onClick={() => handleSwitch(item)}
              className={`w-full rounded-[14px] px-3 py-2 text-left text-sm transition-colors ${
                locale === item
                  ? 'bg-gold/10 text-gold'
                  : 'text-ink-muted hover:bg-raised hover:text-ink'
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

export default function MarketingHeader() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const normalizedPathname = pathname?.replace(/^\/(zh|en|ja)(?=\/|$)/, '') || '/';

  const isActive = (href: string) =>
    href === '/'
      ? normalizedPathname === href
      : normalizedPathname === href || normalizedPathname.startsWith(`${href}/`);

  const activeClass = (href: string) =>
    isActive(href)
      ? 'text-gold'
      : 'text-ink-muted hover:text-ink';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
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
          <Link
            href="/"
            className={`md:hidden flex h-7 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              isActive('/')
                ? 'bg-gold/10 text-gold'
                : 'bg-raised/55 text-ink-muted hover:bg-raised hover:text-ink'
            }`}
          >
            {t('nav_home')}
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm">
          {MARKETING_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={`transition-colors ${activeClass(link.href)}`}>
              {'key' in link ? t(link.key) : blogUi.navLabel}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <LanguageSwitcher />
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('theme_dark') : t('theme_light')}
            className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-gold transition-colors"
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
      <div className="md:hidden border-t border-border-subtle/40 px-3 py-2">
        <nav className="flex items-stretch rounded-xl bg-surface/70 p-1 gap-0.5">
          {MOBILE_MARKETING_LINKS.map(({ href, key, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-[10px] py-2 text-[10px] font-medium transition-all duration-200 ${
                isActive(href)
                  ? 'bg-void shadow-sm text-gold'
                  : 'text-ink-subtle hover:text-ink-muted active:scale-95'
              }`}
            >
              <Icon size={14} />
              <span className="tracking-wide">{t(key)}</span>
            </Link>
          ))}
          <Link
            href="/blog"
            className={`flex-1 flex flex-col items-center justify-center gap-1 rounded-[10px] py-2 text-[10px] font-medium transition-all duration-200 ${
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
