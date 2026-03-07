'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, Aperture, Sun, Moon } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import { buildGoogleOAuthUrl } from '@/lib/api';
import { useTheme } from '@/lib/theme-context';

export default function Header() {
  const { userInfo, logout } = useAuth();
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  const isActive = (href: string) =>
    pathname === href ? 'text-gold' : 'text-ink-muted hover:text-ink';

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border-subtle bg-void/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-2 text-ink hover:text-gold transition-colors group"
        >
          <div className="w-7 h-7 border border-gold/40 rounded flex items-center justify-center group-hover:border-gold/80 transition-colors">
            <Aperture size={14} className="text-gold" />
          </div>
          <span className="font-display text-lg tracking-wide">PicSpeak</span>
        </Link>

        {/* Nav */}
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <Link href="/workspace" className={`transition-colors ${isActive('/workspace')}`}>
            评图工作台
          </Link>
          {userInfo && (
            <>
              <Link href="/account/reviews" className={`transition-colors ${isActive('/account/reviews')}`}>
                评图历史
              </Link>
              <Link href="/account/usage" className={`transition-colors ${isActive('/account/usage')}`}>
                我的额度
              </Link>
            </>
          )}
        </nav>

        {/* Right: theme toggle + identity pill */}
        <div className="flex items-center gap-3">
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? '切换至亮色主题' : '切换至暗色主题'}
            className="w-7 h-7 flex items-center justify-center rounded text-ink-muted hover:text-gold transition-colors"
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {userInfo ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 text-xs">
                <span className={`font-medium ${planColor(userInfo.plan)}`}>
                  {planLabel(userInfo.plan)}
                </span>
                {userInfo.plan === 'guest' && (
                  <span className="text-ink-subtle">· 游客</span>
                )}
              </span>

              {userInfo.plan === 'guest' ? (
                <a
                  href={buildGoogleOAuthUrl()}
                  className="px-3 py-1.5 text-xs border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors"
                >
                  Google 登录
                </a>
              ) : (
                <button
                  onClick={logout}
                  className="text-xs text-ink-subtle hover:text-ink transition-colors"
                >
                  退出
                </button>
              )}
            </div>
          ) : (
            <a
              href={buildGoogleOAuthUrl()}
              className="px-3 py-1.5 text-xs border border-gold/40 text-gold rounded hover:bg-gold/10 transition-colors"
            >
              Google 登录
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
