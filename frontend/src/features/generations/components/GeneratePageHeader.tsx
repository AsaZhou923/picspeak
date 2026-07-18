'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Translator } from '@/lib/i18n';

type GeneratePageHeaderProps = {
  t: Translator;
};

export default function GeneratePageHeader({ t }: GeneratePageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-border-subtle pb-7 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="ui-eyebrow mb-2">{t('generation_badge')}</p>
        <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{t('generation_title')}</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{t('generation_intro')}</p>
      </div>
      <Link
        href="/account/generations"
        className="ui-action-secondary w-full shrink-0 px-4 text-sm sm:w-auto"
      >
        {t('generation_history_link')}
        <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </header>
  );
}
