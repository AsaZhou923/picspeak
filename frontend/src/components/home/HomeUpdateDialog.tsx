'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, Sparkles, X } from 'lucide-react';
import { useI18n, type Locale } from '@/lib/i18n';
import { getLatestProductUpdate } from '@/lib/updates-data';

const STORAGE_PREFIX = 'picspeak:update-seen:';

const COPY: Record<Locale, {
  eyebrow: string;
  latest: string;
  close: string;
  dismiss: string;
  viewAll: string;
}> = {
  zh: {
    eyebrow: 'PicSpeak Release Note',
    latest: '本次更新',
    close: '关闭更新弹窗',
    dismiss: '知道了',
    viewAll: '查看完整更新记录',
  },
  en: {
    eyebrow: 'PicSpeak Release Note',
    latest: 'What changed',
    close: 'Close update dialog',
    dismiss: 'Got it',
    viewAll: 'View the full update log',
  },
  ja: {
    eyebrow: 'PicSpeak Release Note',
    latest: '今回の更新',
    close: '更新ダイアログを閉じる',
    dismiss: '確認しました',
    viewAll: '更新履歴をすべて見る',
  },
};

function storageKey(updateId: string): string {
  return `${STORAGE_PREFIX}${updateId}`;
}

export default function HomeUpdateDialog() {
  const { locale } = useI18n();
  const latest = useMemo(() => getLatestProductUpdate(locale), [locale]);
  const copy = COPY[locale];
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const dismiss = useCallback(() => {
    if (latest) {
      try {
        window.localStorage.setItem(storageKey(latest.id), '1');
      } catch {
        // The release notice remains safely dismissible when storage is blocked.
      }
    }
    setOpen(false);
  }, [latest]);

  useEffect(() => {
    if (!latest) return;

    let seen = false;
    try {
      seen = window.localStorage.getItem(storageKey(latest.id)) === '1';
    } catch {
      // Treat unavailable storage as unseen for this page view.
    }
    if (seen) return;

    const timer = window.setTimeout(() => setOpen(true), 650);
    return () => window.clearTimeout(timer);
  }, [latest]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [dismiss, open]);

  if (!open || !latest) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-void/70 px-0 backdrop-blur-sm animate-fade-in sm:items-center sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) dismiss();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="home-update-dialog-title"
        aria-describedby="home-update-dialog-summary"
        className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] border border-gold/30 bg-surface shadow-level-3 sm:max-w-3xl sm:rounded-[28px]"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(circle_at_18%_0%,rgb(var(--color-gold)/0.22),transparent_62%)]"
        />

        <div className="relative grid sm:grid-cols-[148px_minmax(0,1fr)]">
          <aside className="border-b border-border-subtle py-5 pl-6 pr-20 sm:border-b-0 sm:border-r sm:px-5 sm:py-7">
            <div className="flex items-center justify-between gap-4 sm:block">
              <div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/30 bg-gold/10 text-gold">
                  <Sparkles size={17} aria-hidden="true" />
                </div>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
                  {copy.eyebrow}
                </p>
              </div>
              <div className="text-right sm:mt-10 sm:text-left">
                <p className="font-mono text-xs text-ink-subtle">{latest.date}</p>
                <p className="mt-1 text-xs text-ink-muted">#{latest.id.slice(-11)}</p>
              </div>
            </div>
          </aside>

          <div className="px-6 pb-7 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
            <button
              ref={closeButtonRef}
              type="button"
              onClick={dismiss}
              aria-label={copy.close}
              className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full border border-border-subtle bg-void/70 text-ink-muted transition-colors hover:border-gold/35 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold sm:right-5 sm:top-5"
            >
              <X size={17} aria-hidden="true" />
            </button>

            <div className="pr-11">
              <p className="ui-eyebrow flex items-center gap-2">
                <Clock3 size={13} aria-hidden="true" />
                {copy.latest}
              </p>
              <h2
                id="home-update-dialog-title"
                className="mt-4 text-balance font-display text-3xl leading-[1.05] text-ink sm:text-4xl"
              >
                {latest.title}
              </h2>
              <p id="home-update-dialog-summary" className="mt-4 text-sm leading-7 text-ink-muted">
                {latest.summary}
              </p>
            </div>

            {latest.sections && latest.sections.length > 0 && (
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                {latest.sections.map((section, sectionIndex) => (
                  <article
                    key={section.title}
                    className="rounded-card border border-border-subtle bg-void/35 p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-gold/80">
                        {String(sectionIndex + 1).padStart(2, '0')}
                      </span>
                      <h3 className="font-display text-lg leading-tight text-ink">{section.title}</h3>
                    </div>
                    <ul className="mt-3 space-y-2.5">
                      {section.items.slice(0, 3).map((item) => (
                        <li key={item} className="flex gap-2 text-xs leading-5 text-ink-muted">
                          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))}
              </div>
            )}

            <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={dismiss}
                className="ui-action-secondary justify-center px-5 py-3 text-sm"
              >
                {copy.dismiss}
              </button>
              <Link
                href={`/${locale}/updates#${latest.id}`}
                onClick={dismiss}
                className="ui-action-primary justify-center px-5 py-3 text-sm"
              >
                {copy.viewAll}
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
