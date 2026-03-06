'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, History, RotateCcw, AlertCircle } from 'lucide-react';
import { getReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ApiException } from '@/lib/types';
import ScoreRing, { FinalScoreRing } from '@/components/ui/ScoreRing';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import LoadingSpinner, { SkeletonBlock } from '@/components/ui/LoadingSpinner';

// ─── Score dimensions config ───────────────────────────────────────────────────

const SCORE_DIMS: Array<{ key: string; label: string }> = [
  { key: 'composition', label: '构图' },
  { key: 'lighting', label: '光线' },
  { key: 'color', label: '色彩' },
  { key: 'story', label: '故事' },
  { key: 'technical', label: '技术' },
];

// ─── Section block ────────────────────────────────────────────────────────────

function CritiqueSection({
  accent,
  title,
  body,
}: {
  accent: string;
  title: string;
  body: string;
}) {
  // Split on numbered list markers like "1. " "2. " etc., keeping the marker
  const lines = body
    .split(/(?=\d+\.\s)/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="space-y-2">
      <p className={`text-xs font-mono tracking-widest uppercase ${accent}`}>{title}</p>
      {lines.length > 1 ? (
        <ol className="space-y-1.5 list-none">
          {lines.map((line, i) => (
            <li key={i} className="text-sm text-ink leading-relaxed">
              {line}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink leading-relaxed">{body}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params.reviewId as string;
  const { ensureToken } = useAuth();

  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    ensureToken()
      .then((token) => getReview(reviewId, token))
      .then((data) => {
        setReview(data);
        setLoading(false);
        // Look up cached photo URL
        try {
          const cache = JSON.parse(localStorage.getItem('ps_photo_urls') || '{}');
          if (cache[data.photo_id]) setPhotoUrl(cache[data.photo_id]);
        } catch { /* non-critical */ }
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError('获取点评结果失败，请重试');
        }
      });
  }, [reviewId, ensureToken]);

  if (loading) {
    return (
      <div className="pt-14 min-h-screen">
        <div className="max-w-3xl mx-auto px-6 py-12 space-y-6">
          <SkeletonBlock className="h-6 w-32" />
          <SkeletonBlock className="h-60 w-full" />
          <div className="flex gap-4">
            {SCORE_DIMS.map((d) => (
              <SkeletonBlock key={d.key} className="h-20 w-16 rounded-full" />
            ))}
          </div>
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pt-14 min-h-screen flex items-center justify-center px-6">
        <div className="text-center space-y-4">
          <AlertCircle size={40} className="text-rust mx-auto" />
          <p className="text-rust text-sm">{error}</p>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-xs text-ink-subtle hover:text-ink-muted mx-auto"
          >
            <ArrowLeft size={11} /> 返回
          </button>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const r = review.result;

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => router.push('/workspace')}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          返回工作台
        </button>

        {/* Title + badges */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">
              — 点评结果
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">结果分析</h1>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <ModeBadge mode={review.mode} />
            <StatusBadge status={review.status} />
          </div>
        </div>

        {/* Photo */}
        {photoUrl && !photoError && (
          <div className="photo-frame relative w-full rounded-lg overflow-hidden bg-raised border border-border-subtle mb-8" style={{ maxHeight: '480px' }}>
            <Image
              src={photoUrl}
              alt="被评照片"
              width={1200}
              height={800}
              className="w-full h-full object-contain"
              style={{ maxHeight: '480px' }}
              onError={() => setPhotoError(true)}
              unoptimized
            />
          </div>
        )}

        {/* Score overview */}
        <div className="border border-border-subtle rounded-lg bg-raised p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <FinalScoreRing score={r.final_score} />
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {SCORE_DIMS.map((d) => (
                <ScoreRing
                  key={d.key}
                  score={(r.scores as unknown as Record<string, number>)[d.key] ?? 0}
                  size={64}
                  strokeWidth={3}
                  label={d.label}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Critique text */}
        <div className="border border-border-subtle rounded-lg bg-raised p-6 mb-8 space-y-6">
          <CritiqueSection
            accent="text-sage"
            title="优点"
            body={r.advantage}
          />
          <div className="border-t border-border-subtle" />
          <CritiqueSection
            accent="text-rust"
            title="问题"
            body={r.critique}
          />
          <div className="border-t border-border-subtle" />
          <CritiqueSection
            accent="text-gold"
            title="改进建议"
            body={r.suggestions}
          />
        </div>

        {/* Meta */}
        <p className="text-xs text-ink-subtle font-mono mb-8">
          {new Date(review.created_at).toLocaleString('zh-CN')} · {review.review_id}
        </p>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => router.push('/workspace')}
            className="flex items-center gap-2 px-5 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
          >
            <RotateCcw size={13} />
            再次点评
          </button>
          <Link
            href={`/photos/${review.photo_id}/reviews`}
            className="flex items-center gap-2 px-5 py-2.5 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
          >
            <History size={13} />
            查看该照片历史点评
          </Link>
        </div>
      </div>
    </div>
  );
}
