import { ArrowRight, Camera, ListTodo, RotateCcw } from 'lucide-react';
import { type Translator } from '@/lib/i18n';
import { type NextShootChecklistItem } from '@/lib/review-growth';
import { getReplayIntentCopy } from '@/lib/replay-intent-copy';

interface ReviewGrowthLoopPanelProps {
  locale: 'zh' | 'en' | 'ja';
  checklist: NextShootChecklistItem[];
  actionBusy: string | null;
  onReplayReview: () => void;
  onUploadNew: () => void;
  onChecklistAction: (item: NextShootChecklistItem, index: number) => void;
  t: Translator;
}

function getLoopCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Next Round',
      title: '今回の講評を次の一枚につなげる',
      body: 'まず進み方を選びます。同じ写真で修正を検証するか、新しい写真で改善をやり直すかです。',
      replayTitle: '同じ写真で修正の効き目を確認する',
      replayBody: '露出、色温度、トリミング、局所コントラストのような短い調整を確かめるのに向いています。',
      uploadTitle: '新しい写真で清単を持って撮り直す',
      uploadBody: '機位、タイミング、背景整理、主題分離のように撮り直しが必要な改善に向いています。',
      checklistLabel: 'Next-Shoot Checklist',
      checklistTitle: '次回はまずこの 3 つ',
      checklistBody: '提案を実行順に圧縮しました。次の一枚はここから始めてください。',
      checklistEmpty: '次回は最低スコアの項目を最優先で撮り直してください。',
      observationLabel: 'Observation',
      reasonLabel: 'Why',
      primaryBadge: 'Priority',
      uploadBadge: 'New Photo',
      actionCta: 'ワークスペースへ持ち込む',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Next Round',
      title: 'Turn this critique into the next shot',
      body: 'Choose the next loop first: verify a fix on the same photo, or retake with a new frame and apply the checklist.',
      replayTitle: 'Use the same photo to verify a fix',
      replayBody: 'Best for quick adjustments such as exposure, crop, white balance, or local contrast.',
      uploadTitle: 'Retake with a new photo and carry the checklist',
      uploadBody: 'Best for changes that need a new capture, like camera position, timing, background cleanup, or subject separation.',
      checklistLabel: 'Next-Shoot Checklist',
      checklistTitle: 'Do these three things first',
      checklistBody: 'The suggestions are compressed into the first actions to execute on the next round.',
      checklistEmpty: 'Start the next round by targeting the weakest scored dimension first.',
      observationLabel: 'Observation',
      reasonLabel: 'Why',
      primaryBadge: 'Priority',
      uploadBadge: 'New Photo',
      actionCta: 'Carry this to workspace',
    };
  }
  return {
    label: '下一轮',
    title: '把这次点评直接转成下一次拍摄',
    body: '先选路径：要么用同一张照片验证修正，要么换一张新照片，带着清单重拍。',
    replayTitle: '同一张照片，先验证修正有没有生效',
    replayBody: '适合曝光、色温、裁切、局部反差这类能快速调整的问题。',
    uploadTitle: '换一张新照片，把清单真正拍出来',
    uploadBody: '适合机位、时机、背景整理、主体分离这类必须重新拍摄的改动。',
    checklistLabel: '下次拍摄清单',
    checklistTitle: '下一轮先做这 3 件事',
    checklistBody: '我把建议压成了最先执行的动作，下一次评图先对照它们。',
    checklistEmpty: '下一轮先围绕最低分维度做一轮针对性重拍。',
    observationLabel: '观察',
    reasonLabel: '原因',
    primaryBadge: '第一优先级',
    uploadBadge: '新照片',
    actionCta: '带到工作台',
  };
}

export function ReviewGrowthLoopPanel({
  locale,
  checklist,
  actionBusy,
  onReplayReview,
  onUploadNew,
  onChecklistAction,
  t,
}: ReviewGrowthLoopPanelProps) {
  const copy = getLoopCopy(locale);
  const replayCopy = getReplayIntentCopy(locale);

  return (
    <section className="rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_32%),linear-gradient(180deg,rgba(18,20,24,0.9),rgba(16,17,20,0.82))] p-5 sm:p-6">
      <div className="mb-5">
        <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.24em] text-gold/70">{copy.label}</p>
        <h2 className="max-w-3xl font-display text-[1.95rem] leading-[1.08] text-ink sm:text-[2.15rem]">{copy.title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-ink-muted">{copy.body}</p>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            onClick={onReplayReview}
            disabled={actionBusy !== null}
            className="group flex min-h-[220px] flex-col justify-between rounded-[24px] border border-gold/25 bg-[linear-gradient(180deg,rgba(200,171,90,0.08),rgba(200,171,90,0.04))] p-5 text-left transition-colors hover:border-gold/45 hover:bg-[linear-gradient(180deg,rgba(200,171,90,0.12),rgba(200,171,90,0.06))] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full border border-gold/30 bg-gold/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/85">
                  {copy.primaryBadge}
                </span>
                <RotateCcw size={16} className="shrink-0 text-gold" />
              </div>
              <h3 className="max-w-[20ch] font-display text-[1.65rem] leading-[1.08] text-ink">{replayCopy.samePhotoPanelTitle}</h3>
              <p className="mt-3 max-w-[34ch] text-[13px] leading-6 text-ink-muted">{replayCopy.samePhotoPanelBody}</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-gold">
              {t('review_btn_again')}
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={onUploadNew}
            className="group flex min-h-[220px] flex-col justify-between rounded-[24px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.015))] p-5 text-left transition-colors hover:border-gold/30 hover:bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.02))]"
          >
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="rounded-full border border-border-subtle bg-void/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-subtle">
                  {copy.uploadBadge}
                </span>
                <Camera size={16} className="shrink-0 text-ink-subtle transition-colors group-hover:text-gold" />
              </div>
              <h3 className="max-w-[20ch] font-display text-[1.65rem] leading-[1.08] text-ink">{replayCopy.newPhotoPanelTitle}</h3>
              <p className="mt-3 max-w-[34ch] text-[13px] leading-6 text-ink-muted">{replayCopy.newPhotoPanelBody}</p>
            </div>
            <span className="mt-6 inline-flex items-center gap-1 text-sm font-medium text-ink transition-colors group-hover:text-gold">
              {t('review_btn_upload_next')}
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        <div className="rounded-[24px] border border-border-subtle bg-void/30 p-5">
          <div className="mb-3 flex items-center gap-2">
            <ListTodo size={15} className="text-gold" />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-gold/80">{copy.checklistLabel}</span>
          </div>
          <h3 className="font-display text-[1.7rem] leading-[1.08] text-ink">{copy.checklistTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.checklistBody}</p>

          {checklist.length ? (
            <ol className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {checklist.map((item, index) => (
                <li
                  key={`${item.title}-${index}`}
                  className="rounded-[22px] border border-border-subtle bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.015))] px-4 py-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/12 text-xs font-semibold text-gold">
                      {index + 1}
                    </div>
                    <div className="min-w-0 space-y-3">
                      <p className="text-[15px] font-semibold leading-7 text-ink">{item.title}</p>
                      {item.observation && (
                        <p className="text-xs leading-5 text-ink-subtle">
                          <span className="mr-1 font-medium text-ink/80">{copy.observationLabel}:</span>
                          {item.observation}
                        </p>
                      )}
                      {item.reason && (
                        <p className="text-xs leading-5 text-ink-subtle">
                          <span className="font-medium text-ink">{copy.reasonLabel}:</span> {item.reason}
                        </p>
                      )}
                      {!item.observation && !item.reason && (
                        <p className="text-xs leading-5 text-ink-subtle">{item.detail}</p>
                      )}
                      <button
                        type="button"
                        onClick={() => onChecklistAction(item, index)}
                        className="inline-flex items-center gap-1 rounded-full border border-gold/25 px-3 py-1.5 text-xs font-medium text-gold transition-colors hover:border-gold/45 hover:bg-gold/10"
                      >
                        {copy.actionCta}
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-ink-subtle">
              {copy.checklistEmpty}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
