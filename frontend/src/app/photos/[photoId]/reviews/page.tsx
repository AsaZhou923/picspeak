'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { getPhotoReviews } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { PhotoReviewsResponse, ReviewListItem, ApiException } from '@/lib/types';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import LoadingSpinner, { SkeletonBlock } from '@/components/ui/LoadingSpinner';

export default function PhotoReviewsPage() {
  const params = useParams();
  const router = useRouter();
  const photoId = params.photoId as string;
  const { ensureToken } = useAuth();

  const [items, setItems] = useState<ReviewListItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    async (nextCursor?: string) => {
      try {
        if (!nextCursor) setLoading(true);
        else setLoadingMore(true);

        const token = await ensureToken();
        const data: PhotoReviewsResponse = await getPhotoReviews(
          photoId,
          token,
          nextCursor
        );

        setItems((prev) => (nextCursor ? [...prev, ...data.items] : data.items));
        setCursor(data.next_cursor);
      } catch (err) {
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError('获取历史点评失败，请重试');
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [photoId, ensureToken]
  );

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-2xl mx-auto px-6 py-12 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          返回
        </button>

        {/* Header */}
        <div className="mb-10">
          <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
            — 照片历史点评
          </p>
          <h1 className="font-display text-4xl sm:text-5xl mb-2">历史记录</h1>
          <p className="text-xs text-ink-subtle font-mono">{photoId}</p>
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <SkeletonBlock key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-4 py-3">
            <AlertCircle size={14} />
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <p className="text-ink-muted">这张照片还没有点评记录</p>
            <Link
              href="/workspace"
              className="text-sm text-gold hover:text-gold-light transition-colors"
            >
              前往工作台评图 →
            </Link>
          </div>
        ) : (
          <div className="space-y-px bg-border-subtle rounded-lg overflow-hidden">
            {items.map((item, idx) => (
              <Link
                key={item.review_id}
                href={`/reviews/${item.review_id}`}
                prefetch={false}
                className="flex items-center justify-between gap-3 bg-raised px-5 py-4 hover:bg-overlay transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-ink-subtle font-mono w-5 text-right">
                    {idx + 1}
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ModeBadge mode={item.mode} />
                    <StatusBadge status={item.status} />
                  </div>
                </div>
                <span className="text-xs text-ink-subtle font-mono truncate max-w-[140px] hidden sm:block">
                  {item.review_id}
                </span>
                <ChevronRight
                  size={14}
                  className="text-ink-subtle group-hover:text-gold transition-colors shrink-0"
                />
              </Link>
            ))}
          </div>
        )}

        {/* Load more */}
        {cursor && !loading && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={() => load(cursor)}
              disabled={loadingMore}
              className="flex items-center gap-2 px-5 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 transition-colors disabled:opacity-50"
            >
              {loadingMore ? <LoadingSpinner size={16} /> : null}
              加载更多
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
