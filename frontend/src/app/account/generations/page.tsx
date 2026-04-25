'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, RefreshCw } from 'lucide-react';
import { getMyGenerations } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { GeneratedImageItem } from '@/lib/types';
import { useI18n, type Locale } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';

function formatDate(value: string, locale: Locale) {
  return new Date(value).toLocaleString(locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function GenerationCard({ item }: { item: GeneratedImageItem }) {
  const { t, locale } = useI18n();

  return (
    <Link
      href={`/generations/${item.generation_id}`}
      className="group grid gap-4 rounded-lg border border-border-subtle bg-raised p-3 transition-colors hover:border-gold/40 sm:grid-cols-[112px_minmax(0,1fr)_24px]"
    >
      <div className="overflow-hidden rounded-lg bg-void">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={item.image_url} alt={item.prompt} className="aspect-square h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
      </div>
      <div className="min-w-0 py-1">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">{t('generation_ai_badge')}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">{item.quality}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">{item.size}</span>
          <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">{item.credits_charged} credits</span>
        </div>
        <p className="line-clamp-2 text-sm leading-6 text-ink">{item.prompt}</p>
        <p className="mt-2 font-mono text-xs text-ink-subtle">{formatDate(item.created_at, locale)}</p>
      </div>
      <ChevronRight size={16} className="hidden self-center text-ink-subtle transition-colors group-hover:text-gold sm:block" />
    </Link>
  );
}

export default function GenerationHistoryPage() {
  const { ensureToken, userInfo } = useAuth();
  const { t } = useI18n();
  const [items, setItems] = useState<GeneratedImageItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      try {
        const token = await ensureToken();
        const data = await getMyGenerations(token, { cursor: nextCursor, limit: 20 });
        setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
        setCursor(data.next_cursor);
        setError('');
      } catch (err) {
        setError(formatUserFacingError(t, err, t('generation_history_error_fallback')));
      }
    },
    [ensureToken, t]
  );

  useEffect(() => {
    setLoading(true);
    fetchPage().finally(() => setLoading(false));
  }, [fetchPage, userInfo?.access_token]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-screen pt-14">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 font-mono text-xs uppercase tracking-[0.24em] text-gold/70">{t('generation_history_badge')}</p>
            <h1 className="font-display text-4xl text-ink sm:text-5xl">{t('generation_history_title')}</h1>
          </div>
          <Link href="/generate" className="rounded-full border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-gold">
            {t('generation_history_new')}
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-lg border border-border-subtle bg-raised" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border px-6 py-20 text-center">
            <p className="text-sm text-ink-subtle">{t('generation_history_empty')}</p>
            <Link href="/generate" className="mt-4 inline-flex rounded-full bg-gold px-5 py-2.5 text-sm font-bold text-void hover:bg-gold-light">
              {t('generation_history_start')}
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <GenerationCard key={item.generation_id} item={item} />
              ))}
            </div>
            {cursor && (
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink disabled:opacity-50"
                >
                  {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                  {t('generation_load_more')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
