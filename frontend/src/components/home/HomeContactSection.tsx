'use client';

import Link from 'next/link';
import { ArrowRight, BookOpenText, Mail } from 'lucide-react';
import XBrandIcon from '@/components/ui/XBrandIcon';
import type { Locale, Translator } from '@/lib/i18n';

const HOME_BLOG_LINK_COPY = {
  zh: {
    label: '摄影学习文章',
    hint: '从方法直接进入练习',
  },
  en: {
    label: 'Photography guides',
    hint: 'Move from reading to practice',
  },
  ja: {
    label: '写真ガイド',
    hint: '記事から練習へ',
  },
} as const;

type HomeContactSectionProps = {
  locale: Locale;
  t: Translator;
};

export default function HomeContactSection({ locale, t }: HomeContactSectionProps) {
  const blogHomeCopy = HOME_BLOG_LINK_COPY[locale] ?? HOME_BLOG_LINK_COPY.zh;

  return (
    <section className="px-6 py-16 border-t border-border-subtle">
      <div className="max-w-5xl mx-auto">
        <p className="text-xs text-gold/70 font-mono mb-4 tracking-widest uppercase">{t('contact_label')}</p>
        <h2 className="font-display text-2xl sm:text-3xl mb-8">{t('contact_headline')}</h2>
        <div className="flex flex-col sm:flex-row gap-4">
          <a
            href="https://x.com/Zzw_Prime"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-300 group w-full sm:w-64 active:scale-[0.98]"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
              <XBrandIcon className="text-ink-muted transition-colors group-hover:text-gold" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink group-hover:text-gold transition-colors">X (Twitter)</p>
              <p className="text-xs text-ink-subtle mt-0.5">@Zzw_Prime</p>
            </div>
          </a>
          <a
            href="mailto:xavierzhou23@gmail.com"
            className="flex items-center gap-3 px-5 py-4 border border-border rounded-lg hover:border-gold/40 hover:bg-raised/50 transition-all duration-300 group w-full sm:w-64 active:scale-[0.98]"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full border border-border group-hover:border-gold/40 transition-colors shrink-0">
              <Mail size={14} className="text-ink-muted group-hover:text-gold transition-colors" />
            </span>
            <div>
              <p className="text-sm font-medium text-ink group-hover:text-gold transition-colors">Email</p>
              <p className="text-xs text-ink-subtle mt-0.5">xavierzhou23@gmail.com</p>
            </div>
          </a>
        </div>
        <div className="mt-8 flex justify-end">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/${locale}/blog`}
              className="inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-gold group"
            >
              <BookOpenText size={12} className="text-gold/75 transition-colors group-hover:text-gold" />
              <span>{blogHomeCopy.label}</span>
              <span className="hidden sm:inline opacity-60 group-hover:opacity-100 transition-opacity">
                {blogHomeCopy.hint}
              </span>
              <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <Link
              href={`/${locale}/updates`}
              className="inline-flex items-center gap-2 text-xs text-ink-subtle transition-colors hover:text-gold group"
            >
              <span>{t('updates_label')}</span>
              <span className="hidden sm:inline opacity-60 group-hover:opacity-100 transition-opacity">{t('updates_hint_latest')}</span>
              <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
