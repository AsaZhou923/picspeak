import { useState } from 'react';
import { Copy, Check, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import {
  FLASH_DETAIL_LIMIT,
  detectSuggestionTags,
  parsePointWithShortActionTitle,
  parsePoints,
} from '@/lib/review-page-copy';

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

export function CritiqueSection({
  accent,
  borderColor,
  bgColor,
  icon,
  title,
  body,
  showTags,
  showFeedback,
  isPro = false,
  highlightTop = 0,
  highlightedId,
}: SectionConfig) {
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
          const parsed = parsePointWithShortActionTitle(point);
          const tags = showTags ? detectSuggestionTags(parsed.title, parsed.detail) : [];
          const fullText = parsed.title ? `${parsed.title}: ${parsed.detail}` : parsed.detail;
          const isPriority = highlightTop > 0 && i < highlightTop;
          const isExpanded = expandedSet.has(i);
          const detail = parsed.detail;
          const needsTruncation = !isPro && detail.length > FLASH_DETAIL_LIMIT;
          const displayDetail = needsTruncation && !isExpanded ? `${detail.slice(0, FLASH_DETAIL_LIMIT)}…` : detail;
          const hasTags = showTags && tags.length > 0;
          const cardId = hasTags ? `suggestion-card-${i}` : undefined;
          const tagData = hasTags ? tags.join(' ') : undefined;
          return (
            <div
              key={i}
              id={cardId}
              data-suggestion-tags={tagData}
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
