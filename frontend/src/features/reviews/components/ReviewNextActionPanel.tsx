import { ArrowRight, Camera, ImagePlus } from 'lucide-react';
import type {
  ReviewContinuationAction,
  ReviewContinuationPlan,
} from '@/features/reviews/hooks/reviewContinuationSupport';

interface ReviewNextActionPanelProps {
  locale: 'zh' | 'en' | 'ja';
  plan: ReviewContinuationPlan;
  onRetake: () => void;
  onGenerate: () => void;
}

function getCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Recommended next action',
      choiceTitle: '次の一手を選ぶ',
      singleTitle: '次の一手',
      choiceBody: '撮り直すなら Retake、先に視覚的な目標が必要なら Generate を選べます。どちらもこの講評の文脈を引き継ぎます。',
      retakeTitle: 'この目標で再撮影する',
      retakeBody: '元の講評と撮影目標を保ったまま、新しい一枚を比較します。',
      retakeCta: 'Retake を始める',
      generateTitle: '視覚的な目標を作る',
      generateBody: '講評を引き継いだ参考画像を作り、次の撮影前に方向性を確認します。',
      generateCta: 'Generate を設定',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Recommended next action',
      choiceTitle: 'Choose the next move',
      singleTitle: 'Your next move',
      choiceBody: 'Retake when you are ready to make another frame, or Generate when a visual target would help first. Both keep this review in context.',
      retakeTitle: 'Retake against this target',
      retakeBody: 'Carry the critique and shooting target into a new frame, then compare the change.',
      retakeCta: 'Start a retake',
      generateTitle: 'Create a visual target',
      generateBody: 'Turn this critique into a reference image before you plan the next capture.',
      generateCta: 'Set up Generate',
    };
  }
  return {
    label: '推荐下一步',
    choiceTitle: '选择下一步怎么练',
    singleTitle: '下一步行动',
    choiceBody: '准备好再拍一张时选择重拍；需要先看清视觉目标时选择生成参考。两条路径都会保留这次点评上下文。',
    retakeTitle: '带着目标重拍',
    retakeBody: '把这次点评和拍摄目标带入新照片，再对比具体变化。',
    retakeCta: '开始重拍',
    generateTitle: '先生成视觉目标',
    generateBody: '把点评转成参考图，在下一次拍摄前确认构图、光线或色彩方向。',
    generateCta: '设置参考图',
  };
}

export function ReviewNextActionPanel({
  locale,
  plan,
  onRetake,
  onGenerate,
}: ReviewNextActionPanelProps) {
  if (plan.recommendation === 'none') return null;

  const copy = getCopy(locale);
  const actionConfig: Record<ReviewContinuationAction, {
    title: string;
    body: string;
    cta: string;
    icon: typeof Camera;
    onClick: () => void;
  }> = {
    retake: {
      title: copy.retakeTitle,
      body: copy.retakeBody,
      cta: copy.retakeCta,
      icon: Camera,
      onClick: onRetake,
    },
    generate: {
      title: copy.generateTitle,
      body: copy.generateBody,
      cta: copy.generateCta,
      icon: ImagePlus,
      onClick: onGenerate,
    },
  };

  return (
    <section className="ui-feature-panel p-5 sm:p-6" aria-labelledby="review-next-action-title">
      <p className="ui-eyebrow">{copy.label}</p>
      <h2 id="review-next-action-title" className="mt-2 text-2xl font-semibold leading-tight text-ink">
        {plan.recommendation === 'choice' ? copy.choiceTitle : copy.singleTitle}
      </h2>
      {plan.recommendation === 'choice' && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">{copy.choiceBody}</p>
      )}

      <div className={`mt-5 grid gap-3 ${plan.actions.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {plan.actions.map((action) => {
          const config = actionConfig[action];
          const Icon = config.icon;
          return (
            <button
              key={action}
              type="button"
              onClick={config.onClick}
              className="group min-h-11 rounded-card border border-border bg-raised/70 p-4 text-left shadow-level-1 transition-colors hover:border-gold/50 hover:bg-raised"
            >
              <span className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface text-gold">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{config.title}</span>
                  <span className="mt-1 block text-sm leading-6 text-ink-muted">{config.body}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-gold">
                    {config.cta}
                    <ArrowRight size={14} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
