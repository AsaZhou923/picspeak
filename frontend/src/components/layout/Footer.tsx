'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Twitter } from 'lucide-react';
import { useI18n } from '@/lib/i18n';

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-border-subtle py-10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-ink-subtle">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="PicSpeak" width={14} height={14} className="rounded object-contain opacity-60" />
          <span className="font-display text-sm text-ink-muted tracking-wider">PicSpeak</span>
        </div>

        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-ink transition-colors">{t('footer_home')}</Link>
          <Link href="/workspace" className="hover:text-ink transition-colors">{t('footer_workspace')}</Link>
          <Link href="/account/usage" className="hover:text-ink transition-colors">{t('footer_usage')}</Link>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://x.com/Zzw_Prime"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-ink transition-colors"
          >
            <Twitter size={12} />
            <span>@Zzw_Prime</span>
          </a>
          <p className="text-ink-subtle/60">
            © {new Date().getFullYear()} PicSpeak. AI Photography Critique.
          </p>
        </div>
      </div>
    </footer>
  );
}
