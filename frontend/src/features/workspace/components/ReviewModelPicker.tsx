import { BrainCircuit, Check, Sparkles, Zap } from 'lucide-react';
import type { ReviewModel } from '@/lib/types';

function modelCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'en') {
    return {
      qwenTitle: 'Qwen 3.5',
      qwenBadge: 'Fast',
      qwenBody: 'The established PicSpeak review path for quick everyday feedback.',
      gptTitle: 'GPT-5.5',
      gptBadge: 'Deep vision',
      gptBody: 'Uses OpenAI image reasoning and strict structured output. Usually takes longer.',
    };
  }
  if (locale === 'ja') {
    return {
      qwenTitle: 'Qwen 3.5',
      qwenBadge: '高速',
      qwenBody: '日常の写真講評に適した、従来の高速な PicSpeak 評価です。',
      gptTitle: 'GPT-5.5',
      gptBadge: '深い視覚分析',
      gptBody: 'OpenAI の画像推論と厳密な構造化出力を使用します。通常は時間がかかります。',
    };
  }
  return {
    qwenTitle: 'Qwen 3.5',
    qwenBadge: '快速',
    qwenBody: 'PicSpeak 现有的稳定评图路径，适合快速日常反馈。',
    gptTitle: 'GPT-5.5',
    gptBadge: '深度视觉',
    gptBody: '使用 OpenAI 图片推理和严格结构化输出，通常需要更长时间。',
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
      value: 'qwen' as const,
      title: copy.qwenTitle,
      badge: copy.qwenBadge,
      body: copy.qwenBody,
      icon: Zap,
      tone: 'gold',
    },
    {
      value: 'gpt-5.5' as const,
      title: copy.gptTitle,
      badge: copy.gptBadge,
      body: copy.gptBody,
      icon: BrainCircuit,
      tone: 'sage',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
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
                ? option.tone === 'sage'
                  ? 'border-sage/50 bg-sage/10 shadow-level-1'
                  : 'border-gold/50 bg-gold/10 shadow-level-1'
                : 'border-border-subtle bg-raised/40 hover:border-border hover:bg-raised'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${
                option.tone === 'sage' ? 'border-sage/30 text-sage' : 'border-gold/30 text-gold'
              }`}>
                <Icon size={16} />
              </span>
              <span className={`inline-flex items-center gap-1 rounded-control border px-2 py-1 text-[10px] ${
                option.tone === 'sage' ? 'border-sage/30 text-sage' : 'border-gold/30 text-gold'
              }`}>
                {selected ? <Check size={10} aria-hidden="true" /> : option.value === 'gpt-5.5' ? <Sparkles size={10} aria-hidden="true" /> : null}
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
