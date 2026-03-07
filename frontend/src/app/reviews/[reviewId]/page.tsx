'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, History, RotateCcw, AlertCircle, ThumbsUp, AlertTriangle, Lightbulb } from 'lucide-react';
import { getReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ApiException } from '@/lib/types';
import ScoreRing, { FinalScoreRing } from '@/components/ui/ScoreRing';
import { ModeBadge, StatusBadge } from '@/components/ui/Badge';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';

// ─── Score dimensions config ───────────────────────────────────────────────────

const SCORE_DIMS: Array<{ key: string; label: string }> = [
  { key: 'composition', label: '构图' },
  { key: 'lighting', label: '光线' },
  { key: 'color', label: '色彩' },
  { key: 'story', label: '故事' },
  { key: 'technical', label: '技术' },
];

// ─── Parse body text into individual point strings ────────────────────────────

function parsePoints(body: string): string[] {
  // Try numbered list: "1. xxx 2. xxx"
  const numbered = body.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  // Try newline / semicolons
  const byLine = body.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  return [body.trim()].filter(Boolean);
}

// ─── Critique section with per-item cards ─────────────────────────────────────

type SectionConfig = {
  accent: string;        // text color class
  borderColor: string;   // left-border color class
  bgColor: string;       // card bg class
  icon: React.ReactNode;
  title: string;
  body: string;
};

function CritiqueSection({ accent, borderColor, bgColor, icon, title, body }: SectionConfig) {
  const points = parsePoints(body);
  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 ${accent}`}>
        <span className="opacity-80">{icon}</span>
        <h3 className="font-display text-xl leading-none">{title}</h3>
      </div>
      <div className="space-y-2">
        {points.map((point, i) => (
          <div
            key={i}
            className={`${bgColor} border-l-2 ${borderColor} rounded-r-md px-4 py-3`}
          >
            <p className="text-sm text-ink leading-relaxed">{point}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reviewId = params.reviewId as string;
  const backHref = searchParams.get('back') ?? '/workspace';
  const backLabel = backHref === '/account/reviews' ? '评图历史' : '返回工作台';
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
        if (data.photo_url) {
          setPhotoUrl(data.photo_url);
        }
        setLoading(false);
        if (!data.photo_url) {
          try {
            const cache = JSON.parse(localStorage.getItem('ps_photo_urls') || '{}');
            if (cache[data.photo_id]) setPhotoUrl(cache[data.photo_id]);
          } catch {
            // Ignore cache parsing errors.
          }
        }
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
        <div className="max-w-6xl mx-auto px-6 py-12">
          <SkeletonBlock className="h-6 w-32 mb-8" />
          <div className="grid lg:grid-cols-[45%_1fr] gap-8">
            <SkeletonBlock className="h-[500px] w-full rounded-lg" />
            <div className="space-y-4">
              <SkeletonBlock className="h-8 w-48" />
              <SkeletonBlock className="h-28 w-full rounded-lg" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-4 w-4/5" />
            </div>
          </div>
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
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">

        {/* Back */}
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-8"
        >
          <ArrowLeft size={12} />
          {backLabel}
        </button>

        {/* ── Two-column layout ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[45%_1fr] gap-8 items-start">

          {/* ── LEFT: Photo ──────────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20 space-y-4">
            {photoUrl && !photoError ? (
              <div className="photo-frame relative rounded-lg overflow-hidden bg-raised border border-border-subtle">
                <Image
                  src={photoUrl}
                  alt="被评照片"
                  width={1200}
                  height={900}
                  className="w-full h-auto object-contain"
                  onError={() => setPhotoError(true)}
                  unoptimized
                />
              </div>
            ) : (
              <div className="rounded-lg bg-raised border border-border-subtle flex items-center justify-center h-64 text-ink-subtle text-sm">
                暂无图片
              </div>
            )}

            {/* Score rings on desktop inside left panel */}
            <div className="border border-border-subtle rounded-lg bg-raised p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <FinalScoreRing score={r.final_score} />
                <div className="flex flex-wrap gap-3">
                  {SCORE_DIMS.map((d) => (
                    <ScoreRing
                      key={d.key}
                      score={(r.scores as unknown as Record<string, number>)[d.key] ?? 0}
                      size={58}
                      strokeWidth={3}
                      label={d.label}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Meta + actions */}
            <p className="text-xs text-ink-subtle font-mono">
              {new Date(review.created_at).toLocaleString('zh-CN')} · {review.review_id}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
              >
                <RotateCcw size={13} />
                再次点评
              </button>
              <Link
                href={`/photos/${review.photo_id}/reviews`}
                className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
              >
                <History size={13} />
                该照片历史
              </Link>
            </div>
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div className="space-y-6">
            {/* Title + badges */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">— 点评结果</p>
                <h1 className="font-display text-3xl sm:text-4xl">结果分析</h1>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <ModeBadge mode={review.mode} />
                <StatusBadge status={review.status} />
              </div>
            </div>

            {/* Critique sections */}
            <div className="space-y-5">
              <CritiqueSection
                accent="text-sage"
                borderColor="border-sage"
                bgColor="bg-sage/5"
                icon={<ThumbsUp size={13} />}
                title="优点"
                body={r.advantage}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust"
                borderColor="border-rust"
                bgColor="bg-rust/5"
                icon={<AlertTriangle size={13} />}
                title="问题"
                body={r.critique}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-gold"
                borderColor="border-gold"
                bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />}
                title="改进建议"
                body={r.suggestions}
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
