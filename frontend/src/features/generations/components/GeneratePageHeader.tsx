'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Translator } from '@/lib/i18n';

type GeneratePageHeaderProps = {
  t: Translator;
};

export default function GeneratePageHeader({ t }: GeneratePageHeaderProps) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-gold/70">{t('generation_badge')}</p>
        <h1 className="font-display text-4xl text-ink sm:text-5xl">{t('generation_title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{t('generation_intro')}</p>
      </div>
      <Link
        href="/account/generations"
        className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-gold"
      >
        {t('generation_history_link')}
        <ArrowUpRight size={14} />
      </Link>
    </div>
  );
}
