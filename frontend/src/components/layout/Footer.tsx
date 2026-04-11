'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Github, Twitter } from 'lucide-react';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';

export default function Footer() {
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);

  return (
    <footer className="border-t border-border-subtle py-10 mt-auto">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-ink-subtle">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="PicSpeak"
            width={14}
            height={14}
            className="rounded object-contain opacity-60"
          />
          <span className="font-display text-sm text-ink-muted tracking-wider">PicSpeak</span>
        </div>

        <div className="flex items-center gap-5">
          <Link href="/" className="hover:text-ink transition-colors">
            {t('footer_home')}
          </Link>
          <Link href="/workspace" className="hover:text-ink transition-colors">
            {t('footer_workspace')}
          </Link>
          <Link href={`/${locale}/blog`} className="hover:text-ink transition-colors">
            {blogUi.footerLabel}
          </Link>
          <Link href="/affiliate" className="hover:text-ink transition-colors">
            {t('footer_affiliate')}
          </Link>
          <Link href="/account/usage" className="hover:text-ink transition-colors">
            {t('footer_usage')}
          </Link>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="https://github.com/AsaZhou923/picspeak"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-ink transition-colors"
          >
            <Github size={14} />
            <span>GitHub</span>
          </a>
          <a
            href="https://x.com/Zzw_Prime"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:text-ink transition-colors"
          >
            <Twitter size={14} />
            <span>@Zzw_Prime</span>
          </a>
          <p className="text-ink-subtle/60">
            Copyright {new Date().getFullYear()} PicSpeak. AI Photography Critique.
          </p>
        </div>
      </div>
    </footer>
  );
}
