import { BrainCircuit, Check, Sparkles } from 'lucide-react';
import type { ReviewModel } from '@/lib/types';

function modelCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'en') {
    return {
      gptTitle: 'GPT-6',
      gptBadge: 'Deep vision',
      gptBody: 'GPT-6 reviews five photo dimensions with visible evidence and next-photo actions. Usually takes longer.',
      groupLabel: 'Critique model',
    };
  }
  if (locale === 'ja') {
    return {
      gptTitle: 'GPT-6',
      gptBadge: '深い視覚分析',
      gptBody: 'GPT-6 が写真の5項目を確認し、見える根拠と次の撮影アクションを返します。通常は時間がかかります。',
      groupLabel: '講評モデル',
    };
  }
  return {
    gptTitle: 'GPT-6',
    gptBadge: '深度视觉',
    gptBody: 'GPT-6 会检查照片五个维度，给出画面依据和下一张照片的行动建议，通常需要更长时间。',
    groupLabel: '评图模型',
  };
}

export function ReviewModelPicker({
  value,
  onChange,
  locale,
}: {
  value: ReviewModel;
  onChange: (value: ReviewModel) => void;
  locale: 'zh' | 'en' | 'ja';
}) {
  const copy = modelCopy(locale);
  const options = [
    {
      value: 'gpt-6-luna' as const,
      title: copy.gptTitle,
      badge: copy.gptBadge,
      body: copy.gptBody,
      icon: BrainCircuit,
    },
  ];

  return (
    <div className="grid gap-3" role="radiogroup" aria-label={copy.groupLabel}>
      {options.map((option) => {
        const selected = value === option.value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`relative min-h-40 rounded-card border p-4 text-left transition-all duration-200 ${
              selected
                ? 'border-sage/50 bg-sage/10 shadow-level-1'
                : 'border-border-subtle bg-raised/40 hover:border-border hover:bg-raised'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sage/30 text-sage">
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="inline-flex items-center gap-1 rounded-control border border-sage/30 px-2 py-1 text-[10px] text-sage">
                {selected ? <Check size={10} aria-hidden="true" /> : <Sparkles size={10} aria-hidden="true" />}
                {option.badge}
              </span>
            </div>
            <p className="mt-4 font-display text-xl text-ink">{option.title}</p>
            <p className="mt-2 text-xs leading-6 text-ink-muted">{option.body}</p>
          </button>
        );
      })}
    </div>
  );
}
