'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, History, RotateCcw, AlertCircle, ThumbsUp, ThumbsDown, AlertTriangle, Lightbulb, Upload, TrendingDown, ZoomIn, X, Copy, Check, LogIn, Sparkles, Share2, Download } from 'lucide-react';
import { getReview, getUsage, buildGoogleOAuthUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ReviewGetResponse, ApiException, ReviewScores, UsageResponse } from '@/lib/types';
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
  const dims: (keyof ReviewScores)[] = ['composition', 'lighting', 'color', 'impact', 'technical'];
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

// ─── Score dimension → suggestion tag mapping ─────────────────────────────────
// Each dimension maps to an ordered list of tag candidates to try.
// The first tag whose corresponding card exists in the DOM is used.
// Rationale for non-obvious mappings:
//   lighting  → exposure first (camera exposure adjustment), then post (RAW correction)
//   color     → post first (color grading / white balance), then exposure (WB in-camera)
//   impact    → timing first (golden hour / moment), then pre (framing for impact)
//   technical → focus first (sharpness / depth-of-field), then exposure (settings), then post (noise/sharpen)
const DIM_TO_TAGS: Partial<Record<string, TagKey[]>> = {
  composition: ['composition', 'pre'],
  lighting:    ['exposure', 'post', 'pre'],
  color:       ['post', 'exposure'],
  impact:      ['timing', 'pre'],
  technical:   ['focus', 'exposure', 'post'],
};

// Max detail chars shown before truncation in Flash mode
const FLASH_DETAIL_LIMIT = 120;

// Duration (ms) of the card-highlight animation in tailwind.config.ts
const CARD_HIGHLIGHT_DURATION_MS = 1800;

// ─── Critique section with per-item cards ─────────────────────────────────────

type SectionConfig = {
  accent: string;
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  showTags?: boolean;
  showFeedback?: boolean;
  isPro?: boolean;
  highlightTop?: number;
  highlightedId?: string | null;
};

function CritiqueSection({ accent, borderColor, bgColor, icon, title, body, showTags, showFeedback, isPro = false, highlightTop = 0, highlightedId }: SectionConfig) {
  const { t } = useI18n();
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [expandedSet, setExpandedSet] = useState<Set<number>>(new Set());
  const [feedbackGiven, setFeedbackGiven] = useState<Record<number, 'helpful' | 'vague'>>({});
  const points = parsePoints(body);

  function handleCopy(text: string, index: number) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 1800);
    }).catch(() => {});
  }

  function toggleExpand(index: number) {
    setExpandedSet((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function handleFeedback(index: number, type: 'helpful' | 'vague') {
    setFeedbackGiven((prev) => ({ ...prev, [index]: type }));
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
          const isPriority = highlightTop > 0 && i < highlightTop;
          const isExpanded = expandedSet.has(i);
          const detail = parsed.detail;
          const needsTruncation = !isPro && detail.length > FLASH_DETAIL_LIMIT;
          const displayDetail = needsTruncation && !isExpanded
            ? `${detail.slice(0, FLASH_DETAIL_LIMIT)}…`
            : detail;
          // Stable scroll-target ID: use first tag so dimension click can find this card
          const cardId = showTags && tags.length > 0 ? `suggestion-tag-${tags[0]}` : undefined;
          return (
            <div
              key={i}
              id={cardId}
              className={`group ${bgColor} border-l-2 ${isPriority ? 'border-l-[3px]' : ''} ${borderColor} rounded-r-md px-4 py-3 ${cardId && cardId === highlightedId ? 'animate-card-highlight' : ''}`}
            >
              {isPriority && (
                <div className={`text-[10px] font-semibold ${accent} opacity-60 mb-1.5 tracking-widest uppercase`}>
                  {t('suggestion_priority_badge')}
                </div>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  {parsed.title && (
                    <p className={`text-xs font-semibold ${accent} mb-1.5 opacity-90`}>{parsed.title}</p>
                  )}
                  <p className="text-sm text-ink leading-[1.75]">{displayDetail}</p>
                  {needsTruncation && (
                    <button
                      onClick={() => toggleExpand(i)}
                      className={`mt-1 text-xs ${accent} opacity-60 hover:opacity-100 transition-opacity`}
                    >
                      {isExpanded ? t('suggestion_show_less') : t('suggestion_show_more')}
                    </button>
                  )}
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
              {showFeedback && (
                <div className="mt-2 pt-2 border-t border-border-subtle/40 flex items-center gap-2">
                  {feedbackGiven[i] !== undefined ? (
                    <p className="text-[10px] text-ink-subtle">{t('review_feedback_thanks')}</p>
                  ) : (
                    <>
                      <button
                        onClick={() => handleFeedback(i, 'helpful')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-sage transition-colors"
                      >
                        <ThumbsUp size={9} />{t('review_feedback_helpful')}
                      </button>
                      <span className="text-[10px] text-ink-subtle/30">·</span>
                      <button
                        onClick={() => handleFeedback(i, 'vague')}
                        className="flex items-center gap-1 text-[10px] text-ink-subtle hover:text-rust transition-colors"
                      >
                        <ThumbsDown size={9} />{t('review_feedback_vague')}
                      </button>
                    </>
                  )}
                </div>
              )}
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
    { key: 'impact',      label: t('score_impact'),      desc: t('score_dim_desc_impact') },
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
  const [activeDim, setActiveDim] = useState<string | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [imgNaturalSize, setImgNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const rightColRef = useRef<HTMLDivElement>(null);

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

  // Fetch usage info for quota-low conversion banner (silently ignore failures)
  useEffect(() => {
    ensureToken()
      .then((token) => getUsage(token))
      .then(setUsage)
      .catch(() => {});
  }, [ensureToken]);

  // Click a score dimension → scroll to the best matching tagged suggestion.
  // Tries each tag candidate for the dimension in priority order until a card is found.
  // Uses a brief 150 ms delay so the row-highlight (activeDim) is visible before the
  // page scrolls, making the interaction feel intentional rather than abrupt.
  function handleDimClick(dimKey: string) {
    const tags = DIM_TO_TAGS[dimKey];
    if (!tags || tags.length === 0) return;

    for (const tag of tags) {
      const targetId = `suggestion-tag-${tag}`;
      const el = document.getElementById(targetId);
      if (el) {
        // Highlight the dimension row immediately as tactile feedback
        setActiveDim(dimKey);
        // Short pause lets the highlight register before the viewport moves
        setTimeout(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setHighlightedCardId(targetId);
          // Clear the card glow once the animation finishes
          setTimeout(() => setHighlightedCardId(null), CARD_HIGHLIGHT_DURATION_MS);
        }, 150);
        return;
      }
    }
    // No matching suggestion card found in the DOM — don't activate anything
  }

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
  const isPro = review.mode === 'pro';
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

  // Determine if quota is low for conversion banner
  const quotaRemaining = (() => {
    if (!usage) return null;
    const { daily_remaining, monthly_remaining } = usage.quota;
    if (daily_remaining !== null) return daily_remaining;
    return monthly_remaining;
  })();
  const quotaTotal = (() => {
    if (!usage) return null;
    const { daily_total, monthly_total } = usage.quota;
    if (daily_total !== null) return daily_total;
    return monthly_total;
  })();
  const isLowQuota =
    quotaRemaining !== null &&
    quotaTotal !== null &&
    quotaTotal > 0 &&
    (quotaRemaining <= 2 || quotaRemaining / quotaTotal <= 0.2);
  const plan = userInfo?.plan ?? 'guest';
  const isLowScore = r.final_score < 5.0;

  function handleShareLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(() => {});
  }

  function handleExportSummary() {
    if (!review) return;
    const dimScores = SCORE_DIMS.map(
      (d) => `${d.label}: ${((r.scores as unknown as Record<string, number>)[d.key] ?? 0).toFixed(1)}`,
    ).join(' / ');
    const lines = [
      `PicSpeak — ${t('review_page_headline')}`,
      `${t('score_overall')}: ${r.final_score.toFixed(1)} (${scoreLabel})`,
      dimScores,
      '',
      `——— ${t('review_advantage')} ———`,
      displayAdvantage,
      '',
      `——— ${t('review_critique')} ———`,
      displayCritique,
      '',
      `——— ${t('review_suggestions')} ———`,
      displaySuggestions,
      '',
      `#${review.review_id.slice(0, 8)} · ${new Date(review.created_at).toLocaleString(locale)}`,
      t('review_ai_disclaimer'),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `picspeak-${review.review_id.slice(0, 8)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      setImgNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
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
                  const isActive = activeDim === d.key;
                  const hasTarget = (DIM_TO_TAGS[d.key]?.length ?? 0) > 0;
                  return (
                    <div
                      key={d.key}
                      className={`group/dim relative rounded px-1 -mx-1 py-0.5 transition-colors ${hasTarget ? 'cursor-pointer' : ''} ${isActive ? 'bg-gold/10' : hasTarget ? 'hover:bg-void/30' : ''}`}
                      onClick={() => handleDimClick(d.key)}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`text-xs w-16 shrink-0 ${isWeakest ? 'text-rust' : isActive ? 'text-gold' : 'text-ink-muted'}`}>
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
                        {/* Hover arrow: appears only when the row has a candidate tag and is not already weakest-marked */}
                        {hasTarget && (
                          <span className="text-[10px] text-gold/0 group-hover/dim:text-gold/50 transition-colors shrink-0 select-none" aria-hidden>↓</span>
                        )}
                      </div>
                      {/* Dimension tooltip: shows description + click hint */}
                      <div className="pointer-events-none absolute left-0 bottom-full mb-2 z-10 hidden group-hover/dim:block w-60 rounded-md bg-surface border border-border-subtle px-3 py-2 shadow-lg">
                        <p className="text-[11px] text-ink-muted leading-relaxed">{d.desc}</p>
                        {hasTarget && (
                          <p className="text-[10px] text-gold/70 mt-1.5 pt-1.5 border-t border-border-subtle flex items-center gap-1">
                            <span aria-hidden>↓</span>
                            {t('dim_click_hint')}
                          </p>
                        )}
                        <div className="absolute left-4 top-full w-2 h-2 overflow-hidden">
                          <div className="w-2 h-2 bg-surface border-r border-b border-border-subtle rotate-45 -translate-y-1" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Meta footer */}
              <div className="border-t border-border-subtle px-5 py-2.5 space-y-0.5">
                <p className="text-xs text-ink-subtle font-mono">
                  {new Date(review.created_at).toLocaleString(locale)} · #{review.review_id.slice(0, 8)}
                </p>
                {imgNaturalSize && (
                  <p className="text-xs text-ink-subtle font-mono">
                    {t('review_img_resolution')}: {imgNaturalSize.w} × {imgNaturalSize.h}
                  </p>
                )}
                {review.exif_data && (() => {
                  const exif = review.exif_data;
                  const make = typeof exif.Make === 'string' ? exif.Make.trim() : '';
                  const model = typeof exif.Model === 'string' ? exif.Model.trim() : '';
                  const camera = model.startsWith(make) || !make ? model : `${make} ${model}`;
                  const lens = typeof exif.LensModel === 'string' ? exif.LensModel.trim() : '';
                  const focalRaw = exif.FocalLength;
                  const focal35 = exif.FocalLengthIn35mm;
                  const focal = typeof focalRaw === 'number' && focalRaw > 0
                    ? `${focalRaw % 1 === 0 ? focalRaw : focalRaw.toFixed(1)} mm${typeof focal35 === 'number' && focal35 > 0 && focal35 !== focalRaw ? ` (35mm: ${focal35} mm)` : ''}`
                    : '';
                  const fNumber = exif.FNumber;
                  const aperture = typeof fNumber === 'number' && fNumber > 0 ? `f/${fNumber % 1 === 0 ? fNumber : fNumber.toFixed(1)}` : '';
                  const expTime = exif.ExposureTime;
                  let shutter = '';
                  if (typeof expTime === 'number' && expTime > 0) {
                    if (expTime >= 1) shutter = `${expTime % 1 === 0 ? expTime : expTime.toFixed(1)}s`;
                    else shutter = `1/${Math.round(1 / expTime)}s`;
                  }
                  const iso = typeof exif.ISO === 'number' && exif.ISO > 0 ? String(exif.ISO) : '';
                  const rows: [string, string][] = [
                    [t('review_exif_camera'), camera],
                    [t('review_exif_lens'), lens],
                    [t('review_exif_focal'), focal],
                    [t('review_exif_aperture'), aperture],
                    [t('review_exif_shutter'), shutter],
                    [t('review_exif_iso'), iso],
                  ].filter(([, v]) => v) as [string, string][];
                  if (rows.length === 0) return null;
                  return (
                    <div className="pt-1.5 mt-0.5 border-t border-border-subtle/50 space-y-0.5">
                      <p className="text-[10px] text-ink-muted uppercase tracking-widest font-mono mb-1">{t('review_exif_params')}</p>
                      {rows.map(([label, value]) => (
                        <p key={label} className="text-xs text-ink-subtle font-mono truncate">
                          <span className="text-ink-muted">{label}: </span>{value}
                        </p>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Results ───────────────────────────────────────────── */}
          <div ref={rightColRef} className="space-y-6">

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
                <RotateCcw size={13} />
                {t('review_btn_again')}
              </button>
              <button
                onClick={() => router.push('/workspace')}
                className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
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
                onClick={handleShareLink}
                className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
              >
                {linkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
                {linkCopied ? t('review_link_copied') : t('review_share_link')}
              </button>
              <button
                onClick={handleExportSummary}
                className="flex items-center gap-2 px-4 py-2 border border-border text-ink-muted text-sm rounded hover:border-gold/40 hover:text-gold transition-colors"
              >
                <Download size={13} />
                {t('review_export_summary')}
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
                isPro={isPro}
              />
              <div className="border-t border-border-subtle" />
              <CritiqueSection
                accent="text-rust"
                borderColor="border-rust"
                bgColor="bg-rust/5"
                icon={<AlertTriangle size={13} />}
                title={t('review_critique')}
                body={displayCritique}
                isPro={isPro}
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
                showFeedback
                isPro={isPro}
                highlightTop={2}
                highlightedId={highlightedCardId}
              />
            </div>

            {/* AI disclaimer */}
            <p className="text-xs text-ink-subtle pt-2 border-t border-border-subtle">
              {t('review_ai_disclaimer')}
            </p>

            {/* Quota-low conversion banner (shown when remaining quota is low) */}
            {plan !== 'pro' && isLowQuota && (
              <div className="mt-2 rounded-lg border border-gold/40 bg-gold/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gold/90">
                    {t('review_quota_low_remaining').replace('{n}', String(quotaRemaining ?? 0))}
                  </p>
                  {plan === 'guest' ? (
                    <p className="text-xs text-ink-subtle mt-0.5">{t('guest_login_banner_body')}</p>
                  ) : (
                    <p className="text-xs text-ink-subtle mt-0.5">{t('review_free_upgrade_body')}</p>
                  )}
                </div>
                {plan === 'guest' ? (
                  <a
                    href={buildGoogleOAuthUrl()}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gold text-void text-xs font-medium rounded hover:bg-gold-light transition-colors"
                  >
                    <LogIn size={12} />
                    {t('guest_login_cta')}
                  </a>
                ) : (
                  <Link
                    href="/account/usage"
                    className="shrink-0 flex items-center gap-2 px-4 py-2 bg-gold text-void text-xs font-medium rounded hover:bg-gold-light transition-colors"
                  >
                    <Sparkles size={12} />
                    {t('review_free_upgrade_cta')}
                  </Link>
                )}
              </div>
            )}

            {/* Guest login banner (shown when quota is not low, to encourage sign-in) */}
            {plan === 'guest' && !isLowQuota && (
              <div className="mt-2 rounded-lg border border-gold/25 bg-gold/5 px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
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

            {/* Free → Pro lightweight upgrade entry (low-score variant when score < 5) */}
            {plan === 'free' && !isLowQuota && (
              <div className={`mt-2 rounded-lg border px-5 py-3 flex items-center justify-between gap-3 ${
                isLowScore ? 'border-rust/30 bg-rust/5' : 'border-border-subtle bg-raised/30'
              }`}>
                <div className="min-w-0">
                  <p className={`text-xs font-medium ${isLowScore ? 'text-rust/80' : 'text-ink-muted'}`}>
                    {isLowScore ? t('review_low_score_title') : t('review_free_upgrade_title')}
                  </p>
                  <p className="text-[11px] text-ink-subtle mt-0.5">
                    {isLowScore ? t('review_low_score_body') : t('review_free_upgrade_body')}
                  </p>
                </div>
                <Link
                  href="/account/usage"
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 border text-xs font-medium rounded transition-colors ${
                    isLowScore
                      ? 'border-rust/40 text-rust/80 hover:bg-rust/10'
                      : 'border-gold/30 text-gold hover:bg-gold/10'
                  }`}
                >
                  <Sparkles size={11} />
                  {isLowScore ? t('review_low_score_cta') : t('review_free_upgrade_cta')}
                </Link>
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
