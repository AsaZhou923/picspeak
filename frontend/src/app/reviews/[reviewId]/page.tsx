'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, History, RotateCcw, AlertCircle, ThumbsUp, AlertTriangle, Lightbulb, Upload, TrendingDown, ZoomIn, X, Copy, Check, LogIn } from 'lucide-react';
import { getReview, buildGoogleOAuthUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ApiException, ReviewScores } from '@/lib/types';
import { FinalScoreRing } from '@/components/ui/ScoreRing';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';

// ─── Score helpers ────────────────────────────────────────────────────────────

function getDimColorClass(score: number): string {
  if (score >= 7.5) return 'bg-sage';
  if (score >= 5.5) return 'bg-gold';
  return 'bg-rust';
}

function getDimTextClass(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

function getScoreLabelColor(score: number): string {
  if (score >= 7.5) return 'text-sage';
  if (score >= 5.5) return 'text-gold';
  return 'text-rust';
}

function getWeakestDimKey(scores: ReviewScores): keyof ReviewScores {
  const dims: (keyof ReviewScores)[] = ['composition', 'lighting', 'color', 'story', 'technical'];
  return dims.reduce((weakest, d) => (scores[d] < scores[weakest] ? d : weakest), dims[0]);
}

function generateScoreSummary(
  scores: ReviewScores,
  dims: { key: string; label: string }[],
  locale: string,
): string {
  const sorted = [...dims].sort(
    (a, b) =>
      (scores as unknown as Record<string, number>)[b.key] -
      (scores as unknown as Record<string, number>)[a.key],
  );
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (locale === 'zh') return `${top.label}为本次亮点，${bottom.label}有提升空间`;
  if (locale === 'ja') return `${top.label}が際立っており、${bottom.label}を伸ばす余地があります`;
  return `${top.label} is the highlight; ${bottom.label} has room to grow`;
}

// ─── Suggestion tag detection ─────────────────────────────────────────────────

type TagKey = 'pre' | 'post' | 'composition' | 'timing' | 'exposure' | 'focus';

type TagRule = {
  title: RegExp[];
  strong: RegExp[];
  weak?: RegExp[];
  minWeakMatches?: number;
};

function normalizeSuggestionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[：:，,。；;！!？?（）()[\]【】"'“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countMatches(patterns: RegExp[], text: string): number {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

const TAG_RULES: Record<TagKey, TagRule> = {
  pre: {
    title: [/^(前期|拍摄|拍摄建议|机位|取景|撮影)$/],
    strong: [
      /拍摄时/,
      /拍的时候/,
      /机位/,
      /取景/,
      /视角/,
      /拍摄角度/,
      /站位/,
      /in camera/,
      /while shooting/,
      /during shooting/,
      /撮影時/,
      /アングル/,
      /立ち位置/,
    ],
    weak: [/靠近主体/, /退后一步/, /换个角度/, /移动位置/, /重新拍摄/, /蹲低/, /抬高机位/],
    minWeakMatches: 2,
  },
  post: {
    title: [/^(后期|调色|修图|修片|现像|retouch|editing|post-processing|color grading)$/],
    strong: [
      /后期/,
      /后期处理/,
      /调色/,
      /修图/,
      /修片/,
      /二次裁切/,
      /post process/,
      /post-processing/,
      /editing/,
      /retouch/,
      /color grading/,
      /darkroom/,
      /lightroom/,
      /photoshop/,
      /现像/,
      /レタッチ/,
      /補正/,
    ],
    weak: [
      /降噪/,
      /锐化/,
      /对比度/,
      /饱和度/,
      /色温/,
      /白平衡/,
      /明暗过渡/,
      /contrast/,
      /saturation/,
      /selective saturation/,
      /hue/,
      /midtones?/,
      /highlights?/,
      /shadows?/,
      /white balance/,
      /color temperature/,
      /clarity/,
      /sharpen/,
    ],
    minWeakMatches: 2,
  },
  composition: {
    title: [/^(构图|裁切|裁剪|取景构图|composition|framing|構図)$/],
    strong: [
      /构图/,
      /裁切/,
      /裁剪/,
      /三分法/,
      /黄金比/,
      /留白/,
      /引导线/,
      /地平线/,
      /对称/,
      /前景/,
      /framing/,
      /composition/,
      /rule of thirds/,
      /leading lines/,
      /構図/,
      /トリミング/,
    ],
    weak: [/主体位置/, /视觉重心/, /画面边缘/, /画面平衡/, /背景元素/],
    minWeakMatches: 2,
  },
  timing: {
    title: [/^(时机|拍摄时机|timing|タイミング)$/],
    strong: [
      /时机/,
      /等待/,
      /黄金时段/,
      /蓝调时刻/,
      /日出/,
      /日落/,
      /golden hour/,
      /blue hour/,
      /timing/,
      /タイミング/,
      /マジックアワー/,
    ],
  },
  exposure: {
    title: [/^(曝光|光圈|快门|iso|exposure|露出)$/],
    strong: [
      /曝光/,
      /欠曝/,
      /过曝/,
      /高光过曝/,
      /压高光/,
      /提亮阴影/,
      /光圈/,
      /快门/,
      /\biso\b/,
      /exposure/,
      /aperture/,
      /shutter/,
      /露出/,
      /シャッター/,
      /絞り/,
    ],
    weak: [/测光/, /亮部细节/, /暗部细节/],
    minWeakMatches: 2,
  },
  focus: {
    title: [/^(对焦|焦点|清晰度|focus|フォーカス|ピント)$/],
    strong: [
      /对焦/,
      /焦点/,
      /虚焦/,
      /跑焦/,
      /景深/,
      /焦平面/,
      /清晰度/,
      /锐度/,
      /focus/,
      /sharpness/,
      /depth of field/,
      /ピント/,
      /フォーカス/,
      /被写界深度/,
    ],
    weak: [/主体不够清晰/, /边缘发虚/, /背景虚化过重/],
    minWeakMatches: 2,
  },
};

function detectSuggestionTags(title: string, detail: string): TagKey[] {
  const normalizedTitle = normalizeSuggestionText(title);
  const normalizedDetail = normalizeSuggestionText(detail);
  const combined = `${normalizedTitle} ${normalizedDetail}`.trim();

  return (Object.entries(TAG_RULES) as [TagKey, TagRule][])
    .filter(([, rule]) => {
      if (rule.title.some((pattern) => pattern.test(normalizedTitle))) return true;
      if (rule.strong.some((pattern) => pattern.test(normalizedDetail) || pattern.test(combined))) return true;
      if (!rule.weak?.length) return false;
      return countMatches(rule.weak, combined) >= (rule.minWeakMatches ?? 2);
    })
    .map(([tag]) => tag);
}

// ─── Parse body text into individual point strings ────────────────────────────

function parsePoints(body: string): string[] {
  const numbered = body.split(/(?=\d+\.\s)/).map((s) => s.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  const byLine = body.split(/[\n；;]+/).map((s) => s.trim()).filter(Boolean);
  if (byLine.length > 1) return byLine;
  return [body.trim()].filter(Boolean);
}

function parsePointWithTitle(raw: string): { title: string; detail: string } {
  const text = raw.replace(/^\d+[.、．]\s*/, '');
  const colonRe = /^([^：:\n。，,]{2,20})[：:]\s*(.+)/s;
  const m = text.match(colonRe);
  if (m) return { title: m[1].trim(), detail: m[2].trim() };
  return { title: '', detail: text.trim() };
}

// ─── Critique section with per-item cards ─────────────────────────────────────

type SectionConfig = {
  accent: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  showTags?: boolean;
};

function CritiqueSection({ accent, borderColor, bgColor, icon, title, body, showTags }: SectionConfig) {
  const { t } = useI18n();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const points = parsePoints(body);

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    }).catch(() => {});
  }

  return (
    <div className="space-y-3">
      <div className={`flex items-center gap-2.5 ${accent}`}>
        <span className="opacity-80">{icon}</span>
        <h3 className="font-display text-xl leading-none">{title}</h3>
      </div>
      <div className="space-y-2.5">
        {points.map((point, i) => {
          const parsed = parsePointWithTitle(point);
          const tags = showTags ? detectSuggestionTags(parsed.title, parsed.detail) : [];
          const fullText = parsed.title ? `${parsed.title}: ${parsed.detail}` : parsed.detail;
          return (
            <div
              key={i}
              className={`group ${bgColor} border-l-2 ${borderColor} rounded-r-md px-4 py-3`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {parsed.title && (
                    <p className={`text-xs font-semibold ${accent} mb-1.5 opacity-90`}>{parsed.title}</p>
                  )}
                  <p className="text-sm text-ink leading-[1.75]">{parsed.detail}</p>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gold/10 text-gold/80 border border-gold/20 font-medium tracking-wide">
                          {t(`tag_${tag}` as Parameters<typeof t>[0])}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(fullText, i)}
                  className="opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0 mt-0.5 p-1 rounded text-ink-subtle hover:text-ink-muted transition-all"
                  title={t('copy_btn')}
                  aria-label={t('copy_btn')}
                >
                  {copiedIndex === i ? <Check size={12} className="text-sage" /> : <Copy size={12} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReviewPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();

  const SCORE_DIMS = [
    { key: 'composition', label: t('score_composition'), desc: t('score_dim_desc_composition') },
    { key: 'lighting',    label: t('score_lighting'),    desc: t('score_dim_desc_lighting') },
    { key: 'color',       label: t('score_color'),       desc: t('score_dim_desc_color') },
    { key: 'story',       label: t('score_story'),       desc: t('score_dim_desc_story') },
    { key: 'technical',   label: t('score_technical'),   desc: t('score_dim_desc_technical') },
  ];

  const reviewId = params.reviewId as string;
  const backHref = searchParams.get('back') ?? '/workspace';
  const backLabel = backHref === '/account/reviews' ? t('review_back_history') : t('review_back_workspace');
  const { ensureToken, userInfo } = useAuth();

  const DEMO_REVIEW_ID = 'rev_35e0951d0df94a1e';

  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Close zoom on Escape key
  useEffect(() => {
    if (!zoomOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setZoomOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [zoomOpen]);

  useEffect(() => {
    ensureToken()
      .then((token) => getReview(reviewId, token))
      .then((data) => {
        setReview(data);
        if (data.photo_url) {
          setPhotoUrl(data.photo_url);
        }
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        if (err instanceof ApiException) {
          setError(err.message);
        } else {
          setError(t('review_err_fetch'));
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
            <ArrowLeft size={11} /> {t('back_btn')}
          </button>
        </div>
      </div>
    );
  }

  if (!review) return null;

  const r = review.result;
  const isDemoReview = reviewId === DEMO_REVIEW_ID;
  const displayAdvantage   = isDemoReview && locale !== 'zh' ? t('demo_review_advantage')   : r.advantage;
  const displayCritique    = isDemoReview && locale !== 'zh' ? t('demo_review_critique')    : r.critique;
  const displaySuggestions = isDemoReview && locale !== 'zh' ? t('demo_review_suggestions') : r.suggestions;
  const weakestKey = getWeakestDimKey(r.scores);
  const weakestDim = SCORE_DIMS.find((d) => d.key === weakestKey) ?? SCORE_DIMS[0];
  const scoreLabelColor = getScoreLabelColor(r.final_score);
  const scoreLabel =
    r.final_score >= 9.0 ? t('score_label_excellent')
    : r.final_score >= 7.5 ? t('score_label_good')
    : r.final_score >= 6.0 ? t('score_label_above_avg')
    : r.final_score >= 4.0 ? t('score_label_average')
    : t('score_label_weak');
  const scoreSummary = generateScoreSummary(r.scores, SCORE_DIMS, locale);

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12 animate-fade-in">

        {/* Back */}
        <button
          onClick={() => router.push(backHref)}
          className="flex items-center gap-1.5 text-xs text-ink-subtle hover:text-ink-muted transition-colors mb-6"
        >
          <ArrowLeft size={12} />
          {backLabel}
        </button>

        {/* ── Score hero strip ─────────────────────────────────────────────── */}
        <div className="mb-6 rounded-xl border border-border-subtle bg-raised/50 px-6 py-5 flex items-center gap-5">
          <FinalScoreRing score={r.final_score} />
          <div className="min-w-0">
            <div className={`font-display text-2xl leading-none ${scoreLabelColor}`}>{scoreLabel}</div>
            <div className="text-xs text-ink-muted mt-1.5 leading-relaxed">{t('review_score_dims_basis')}</div>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-1.5 text-xs text-ink-subtle">
            <TrendingDown size={11} className="text-rust shrink-0" />
            <span>{t('review_score_lowest')}:</span>
            <span className="text-rust/70 ml-0.5">{weakestDim.label}</span>
          </div>
        </div>

        {/* ── Two-column layout ───────────────────────────────────────────── */}
        <div className="grid lg:grid-cols-[360px_1fr] gap-8 items-start">

          {/* ── LEFT: Photo + Scores ──────────────────────────────────────── */}
          <div className="lg:sticky lg:top-20">
            <div className="rounded-xl overflow-hidden border border-border-subtle bg-raised">
              {/* Photo */}
              {photoUrl && !photoError ? (
                <div
                  className="photo-frame relative cursor-zoom-in group"
                  onClick={() => setZoomOpen(true)}
                  title={t('img_zoom_label')}
                >
                  <Image
                    src={photoUrl}
                    alt={t('review_photo_alt')}
                    width={1200}
                    height={900}
                    className="w-full h-auto object-contain max-h-[65vh]"
                    onError={() => setPhotoError(true)}
                    unoptimized
                  />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-void/30">
                    <ZoomIn size={32} className="text-white drop-shadow-lg" />
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-ink-subtle text-sm">
                  {t('review_no_image')}
                </div>
              )}

              {/* Dimension scores */}
              <div className="border-t border-border-subtle px-5 py-4 space-y-2">
                {SCORE_DIMS.map((d) => {
                  const score = (r.scores as unknown as Record<string, number>)[d.key] ?? 0;
                  const isWeakest = d.key === weakestKey;
                  return (
                    <div key={d.key} className="group/dim relative">
                      <div className="flex items-center gap-2.5">
                        <span className={`text-xs w-16 shrink-0 ${isWeakest ? 'text-rust' : 'text-ink-muted'}`}>
                          {d.label}
                        </span>
                        <div className="flex-1 h-1.5 bg-void/50 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ${getDimColorClass(score)}`}
                            style={{ width: `${score * 10}%` }}
                          />
                        </div>
                        <span className={`text-xs font-mono w-7 text-right shrink-0 ${getDimTextClass(score)}`}>
                          {score.toFixed(1)}
                        </span>
                        {isWeakest && <TrendingDown size={10} className="text-rust shrink-0" />}
                      </div>
                      {/* Dimension tooltip */}
                      <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-10 hidden group-hover/dim:block w-56 rounded-md bg-surface border border-border-subtle px-3 py-2 shadow-lg">
                        <p className="text-[11px] text-ink-muted leading-relaxed">{d.desc}</p>
                        <div className="absolute left-4 top-full w-2 h-2 overflow-hidden">
                          <div className="w-2 h-2 bg-surface border-r border-b border-border-subtle rotate-45 -translate-y-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta footer */}
              <div className="border-t border-border-subtle px-5 py-2.5">
                <p className="text-xs text-ink-subtle font-mono">
                  {new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Header */}
            <div>
              <p className="text-xs text-gold/70 font-mono mb-2 tracking-widest uppercase">— {t('review_page_label')}</p>
              <h1 className="font-display text-3xl sm:text-4xl mb-2">{t('review_page_headline')}</h1>
              <p className="text-sm text-ink-muted mb-3 leading-relaxed">{scoreSummary}</p>
              {/* Metadata row: mode · status · date */}
              <div className="flex items-center gap-2 text-xs text-ink-subtle">
                <span className={review.mode === 'pro' ? 'text-gold font-medium' : 'text-ink-muted'}>
                  {review.mode === 'pro' ? 'Pro' : 'Flash'}
                </span>
                <span>·</span>
                <span className="text-sage">{t('status_succeeded')}</span>
                <span>·</span>
                <span>{new Date(review.created_at).toLocaleDateString(locale)}</span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2.5">
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
              >
                <Upload size={13} />
                {t('review_btn_upload_next')}
              </button>
              {userInfo?.plan !== 'guest' && (
                <Link
                  href="/account/reviews"
                  className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
                >
                  <History size={13} />
                  {t('review_btn_history_all')}
                </Link>
              )}
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2 px-3 py-2 text-ink-subtle text-xs rounded hover:text-ink-muted transition-colors"
              >
                <RotateCcw size={11} />
                {t('review_btn_again')}
              </button>
            </div>

            <div className="border-t border-border-subtle" />

            {/* Critique sections */}
            <div className="space-y-6 max-w-2xl">
              <CritiqueSection
                accent="text-sage"
                borderColor="border-sage"
                bgColor="bg-sage/5"
                icon={<ThumbsUp size={13} />}
                title={t('review_advantage')}
                body={displayAdvantage}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust"
                borderColor="border-rust"
                bgColor="bg-rust/5"
                icon={<AlertTriangle size={13} />}
                title={t('review_critique')}
                body={displayCritique}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-gold"
                borderColor="border-gold"
                bgColor="bg-gold/5"
                icon={<Lightbulb size={13} />}
                title={t('review_suggestions')}
                body={displaySuggestions}
                showTags
              />
            </div>

            {/* AI disclaimer */}
            <p className="text-xs text-ink-subtle pt-2 border-t border-border-subtle">
              {t('review_ai_disclaimer')}
            </p>

            {/* Guest login conversion banner */}
            {userInfo?.plan === 'guest' && (
              <div className="mt-4 rounded-lg border border-gold/25 bg-gold/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gold/90">{t('guest_login_banner_title')}</p>
                  <p className="text-xs text-ink-subtle mt-0.5">{t('guest_login_banner_body')}</p>
                </div>
                <a
                  href={buildGoogleOAuthUrl()}
                  className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gold text-void text-xs font-medium rounded hover:bg-gold-light transition-colors"
                >
                  <LogIn size={12} />
                  {t('guest_login_cta')}
                </a>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Image zoom overlay ───────────────────────────────────────────── */}
      {zoomOpen && photoUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm"
          onClick={() => setZoomOpen(false)}
        >
          <button
            onClick={() => setZoomOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-raised/80 border border-border-subtle text-ink-muted hover:text-ink transition-colors"
            aria-label={t('img_zoom_close')}
          >
            <X size={18} />
          </button>
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={photoUrl}
              alt={t('review_photo_zoom_alt')}
              width={2400}
              height={1800}
              className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
              unoptimized
            />
          </div>
        </div>
      )}
    </div>
  );
}
