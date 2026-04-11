'use client';

import Link from 'next/link';
import { ArrowRight, Clock3, FileText } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getProductUpdates } from '@/lib/updates-data';

function getPageCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Update Log',
      title: '最新の更新詳細とリリース一覧',
      intro: '最新リリースの詳細を上部に表示し、その下に最近の更新を一覧で並べています。',
      latestLabel: 'Latest Release',
      listLabel: 'Recent Releases',
      latestBadge: 'Latest',
      docLabel: 'Doc path',
      backHome: 'Back home',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Update Log',
      title: 'Latest Release Detail and Update List',
      intro: 'The newest release is shown in full at the top, followed by a list of recent product updates.',
      latestLabel: 'Latest Release',
      listLabel: 'Recent Releases',
      latestBadge: 'Latest',
      docLabel: 'Doc path',
      backHome: 'Back home',
    };
  }

  return {
    label: 'Update Log',
    title: '最新更新详情与历史更新列表',
    intro: '页面顶部展示最新一条更新的完整内容，下方保留最近多条更新记录，方便快速回看。',
    latestLabel: '最新发布',
    listLabel: '最近更新',
    latestBadge: '最新',
    docLabel: '文档路径',
    backHome: '返回首页',
  };
}

export default function UpdatesPage() {
  const { locale } = useI18n();
  const copy = getPageCopy(locale);
  const updates = getProductUpdates(locale);
  const latest = updates[0];

  if (!latest) return null;

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-6xl px-6 py-14 animate-fade-in">
        <div className="mb-10 max-w-3xl">
          <p className="mb-3 text-xs uppercase tracking-[0.32em] text-gold/70">{copy.label}</p>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{copy.title}</h1>
          <p className="mt-4 text-sm leading-7 text-ink-muted">{copy.intro}</p>
        </div>

        <section className="overflow-hidden rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(149,113,87,0.1),transparent_38%),rgb(var(--color-surface)/0.8)]">
          <div className="border-b border-border-subtle px-6 py-5">
            <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-ink">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold">
                  <Clock3 size={16} />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-gold/70">{copy.latestLabel}</p>
                  <p className="font-mono text-sm text-ink-muted">{latest.date}</p>
                </div>
              </div>
              <span className="rounded-full border border-gold/25 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-gold/80">
                {copy.latestBadge}
              </span>
            </div>
          </div>

          <div className="px-6 py-6">
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_320px]">
              <div>
                <h2 className="font-display text-3xl text-ink sm:text-4xl">{latest.title}</h2>
                <p className="mt-4 text-sm leading-7 text-ink-muted">{latest.summary}</p>

                {latest.sections && latest.sections.length > 0 && (
                  <div className="mt-8 grid gap-5 md:grid-cols-2">
                    {latest.sections.map((section) => (
                      <article
                        key={section.title}
                        className="rounded-[22px] border border-border-subtle bg-raised/55 p-5"
                      >
                        <h3 className="font-display text-2xl text-ink">{section.title}</h3>
                        <div className="mt-4 space-y-3">
                          {section.items.map((item) => (
                            <p key={item} className="flex gap-3 text-sm leading-7 text-ink-muted">
                              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
                              <span>{item}</span>
                            </p>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>

              <aside className="rounded-[22px] border border-border-subtle bg-raised/45 p-5">
                <div className="flex items-center gap-2 text-sm text-ink">
                  <FileText size={14} className="text-gold" />
                  <span>{copy.docLabel}</span>
                </div>
                <p className="mt-3 break-all font-mono text-xs leading-6 text-ink-muted">
                  {latest.docPath}
                </p>
                <div className="mt-6">
                  <Link
                    href="/"
                    className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
                  >
                    {copy.backHome}
                    <ArrowRight size={13} />
                  </Link>
                </div>
              </aside>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="font-display text-3xl text-ink">{copy.listLabel}</h2>
            <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{updates.length}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {updates.map((entry, index) => (
              <article
                key={entry.id}
                className="rounded-[22px] border border-border-subtle bg-raised/45 p-5 transition-colors hover:border-gold/25"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-xs text-ink-subtle">{entry.date}</p>
                  {index === 0 && (
                    <span className="rounded-full border border-gold/20 bg-gold/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-gold/80">
                      {copy.latestBadge}
                    </span>
                  )}
                </div>
                <h3 className="mt-4 font-display text-2xl text-ink">{entry.title}</h3>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{entry.summary}</p>
                <div className="mt-5 rounded-2xl border border-border-subtle bg-void/30 px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-ink-subtle">{copy.docLabel}</p>
                  <p className="mt-2 break-all font-mono text-xs leading-6 text-ink-muted">{entry.docPath}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
