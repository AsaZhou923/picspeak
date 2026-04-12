'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Github, Twitter } from 'lucide-react';
import { getBlogUi } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';

export default function Footer() {
  const { t, locale } = useI18n();
  const blogUi = getBlogUi(locale);
  const badgeLinkClass =
    'group flex shrink-0 min-w-[220px] items-center gap-3 rounded-full border border-border-subtle bg-raised/60 px-4 py-2.5 text-left text-ink-subtle transition-all hover:border-gold/25 hover:bg-raised/85 hover:text-ink';
  const badgeEyebrowClass = 'text-[10px] uppercase tracking-[0.24em] text-ink-muted/75';
  const badgeTitleClass = 'text-sm font-medium text-ink';

  const badgeGroup = (
    <div className="flex items-center gap-6 pr-6">
      <a
        href="https://indieai.directory/"
        target="_blank"
        rel="noopener noreferrer"
        className={badgeLinkClass}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-xs font-semibold uppercase tracking-[0.18em] text-gold">
          IA
        </span>
        <span className="flex flex-col leading-tight">
          <span className={badgeEyebrowClass}>Listed on</span>
          <span className={badgeTitleClass}>IndieAI Directory</span>
        </span>
      </a>
      <a
        href="https://saastoolsdir.com"
        target="_blank"
        rel="noopener noreferrer"
        className={badgeLinkClass}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-void/60 text-xs font-semibold uppercase tracking-[0.18em] text-ink">
          ST
        </span>
        <span className="flex flex-col leading-tight">
          <span className={badgeEyebrowClass}>Featured on</span>
          <span className={badgeTitleClass}>SaaS Tools Dir</span>
        </span>
      </a>
      <a
        href="https://saashubdirectory.com"
        target="_blank"
        rel="noopener noreferrer"
        className={badgeLinkClass}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-void/60 text-xs font-semibold uppercase tracking-[0.18em] text-ink">
          SH
        </span>
        <span className="flex flex-col leading-tight">
          <span className={badgeEyebrowClass}>Featured on</span>
          <span className={badgeTitleClass}>SaaS Hub Directory</span>
        </span>
      </a>
      <a
        href="https://productlistdir.com"
        target="_blank"
        rel="noopener noreferrer"
        className={badgeLinkClass}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-void/60 text-xs font-semibold uppercase tracking-[0.18em] text-ink">
          PL
        </span>
        <span className="flex flex-col leading-tight">
          <span className={badgeEyebrowClass}>Featured on</span>
          <span className={badgeTitleClass}>Product List Dir</span>
        </span>
      </a>
    </div>
  );

  const badgesContent = (
    <>
      {badgeGroup}
      {badgeGroup}
      {badgeGroup}
      {badgeGroup}
      {badgeGroup}
    </>
  );

  return (
    <footer className="border-t border-border-subtle py-8 mt-auto overflow-hidden">
      {/* Badges Marquee Section */}
      <div className="w-full flex overflow-hidden mb-8 border-b border-border-subtle/30 pb-6 opacity-80">
        <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
          <div className="flex items-center">{badgesContent}</div>
          <div className="flex items-center">{badgesContent}</div>
        </div>
      </div>

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
