'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, ChevronRight, ImageOff, RefreshCw } from 'lucide-react';
import { getMyReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewHistoryItem, ApiException } from '@/lib/types';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, (score / 10) * 100));
  const color =
    score >= 8 ? 'bg-sage' : score >= 6 ? 'bg-gold' : 'bg-rust';
  return (
    <div className="flex items-center gap-2">
      <span className="text-base font-display text-ink w-8 shrink-0">{score.toFixed(1)}</span>
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Review card ──────────────────────────────────────────────────────────────

function ReviewCard({ item }: { item: ReviewHistoryItem }) {
  const [imgError, setImgError] = useState(false);
  const date = new Date(item.created_at).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Link
      href={`/reviews/${item.review_id}?back=/account/reviews`}
      className="group flex items-center gap-4 border border-border-subtle rounded-lg bg-raised px-4 py-3 hover:border-gold/40 hover:bg-raised/80 transition-all"
    >
      {/* Thumbnail */}
      <div className="shrink-0 w-16 h-16 rounded overflow-hidden bg-void border border-border-subtle flex items-center justify-center">
        {item.photo_url && !imgError ? (
          <Image
            src={item.photo_url}
            alt="照片缩略图"
            width={64}
            height={64}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <ImageOff size={20} className="text-ink-subtle" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <ModeBadge mode={item.mode} />
          <StatusBadge status={item.status} />
        </div>
        {item.status === 'SUCCEEDED' && (
          <ScoreBar score={item.final_score} />
        )}
        <p className="text-xs text-ink-subtle font-mono">{date}</p>
      </div>

      {/* Arrow */}
      <ChevronRight
        size={16}
        className="shrink-0 text-ink-subtle group-hover:text-gold transition-colors"
      />
    </Link>
  );
}

// ─── Skeleton list ────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonBlock key={i} className="h-[88px] w-full" />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewHistoryPage() {
  const { ensureToken } = useAuth();

  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);

  const fetchPage = useCallback(
    async (nextCursor?: string) => {
      try {
        const token = await ensureToken();
        const data = await getMyReviews(token, nextCursor);
        if (nextCursor) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setCursor(data.next_cursor);
        setHasMore(data.next_cursor !== null);
      } catch (err) {
        const msg =
          err instanceof ApiException ? err.message : '获取评图历史失败';
        setError(msg);
      }
    },
    [ensureToken]
  );

  useEffect(() => {
    fetchPage().finally(() => setLoading(false));
  }, [fetchPage]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  };

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
            — 历史记录
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">评图历史</h1>
        </div>

        {loading ? (
          <SkeletonList />
        ) : error ? (
          <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <p className="text-ink-subtle text-sm">暂无评图记录</p>
            <Link
              href="/workspace"
              className="inline-flex items-center gap-1.5 text-xs text-gold border border-gold/30 rounded px-3 py-1.5 hover:bg-gold/10 transition-colors"
            >
              去评图
              <ChevronRight size={11} />
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((item) => (
                <ReviewCard key={item.review_id} item={item} />
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="flex items-center gap-2 mx-auto px-5 py-2 text-sm text-ink-muted border border-border rounded hover:border-gold/40 hover:text-ink transition-colors disabled:opacity-50"
                >
                  {loadingMore && (
                    <RefreshCw size={13} className="animate-spin" />
                  )}
                  {loadingMore ? '加载中…' : '加载更多'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
