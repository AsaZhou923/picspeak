import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Camera, ListTodo, PenLine, Shuffle, X } from 'lucide-react';
import { getPracticeConfig } from '@/lib/api';
import { type Translator } from '@/lib/i18n';
import { type NextShootChecklistItem } from '@/lib/review-growth';
import { usePracticeExposure } from '@/features/reviews/hooks/usePracticeExposure';

interface ReviewGrowthLoopPanelProps {
  sourceReviewId: string;
  locale: 'zh' | 'en' | 'ja';
  checklist: NextShootChecklistItem[];
  actionBusy: string | null;
  onUploadEdited: () => void;
  onUploadNew: () => void;
  onChecklistAction: (item: NextShootChecklistItem, index: number) => void;
  t: Translator;
}

function getLoopCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: '次の一枚',
      title: '今回の講評を次の一枚につなげる',
      body: 'まず進み方を選びます。編集後の写真をアップロードして修正を検証するか、新しく撮り直して比較します。',
      editTitle: '編集後の写真をアップロードして検証する',
      editBody: 'トリミング、露出、色温度、局所コントラストを外部で直した後、その新しいファイルを比較します。',
      uploadTitle: '新しい写真でチェックリストを持って撮り直す',
      uploadBody: '機位、タイミング、背景整理、主題分離のように撮り直しが必要な改善に向いています。',
      checklistLabel: '次の撮影チェックリスト',
      checklistTitle: '次の一手',
      checklistBody: '提案を実行順に圧縮しました。次の一枚はここから始めてください。',
      checklistEmpty: '次回は最低スコアの項目を最優先で撮り直してください。',
      observationLabel: '観察',
      reasonLabel: '理由',
      editBadge: '編集後の写真',
      uploadBadge: '新しい写真',
      actionCta: 'ワークスペースへ持ち込む',
      goalLabel: 'Practice Goal',
      acceptGoal: 'この目標で練習',
      editGoal: '目標を編集',
      alternativeGoal: '別の目標',
      skipGoal: '今は練習しない',
    };
  }
  if (locale === 'en') {
    return {
      label: 'Next Round',
      title: 'Turn this critique into the next shot',
      body: 'Choose the next loop first: upload the edited file to verify a fix, or retake with a new frame and apply the checklist.',
      editTitle: 'Upload the edited photo to verify the fix',
      editBody: 'Use this after you changed crop, exposure, white balance, or local contrast outside PicSpeak. The upload must be the revised file.',
      uploadTitle: 'Retake with a new photo and carry the checklist',
      uploadBody: 'Best for changes that need a new capture, like camera position, timing, background cleanup, or subject separation.',
      checklistLabel: 'Next-Shoot Checklist',
      checklistTitle: 'Next step suggestion',
      checklistBody: 'The suggestions are compressed into the first actions to execute on the next round.',
      checklistEmpty: 'Start the next round by targeting the weakest scored dimension first.',
      observationLabel: 'Observation',
      reasonLabel: 'Why',
      editBadge: 'Edited Photo',
      uploadBadge: 'New Photo',
      actionCta: 'Carry this to workspace',
      goalLabel: 'Practice Goal',
      acceptGoal: 'Practice this goal',
      editGoal: 'Edit goal',
      alternativeGoal: 'Try another goal',
      skipGoal: 'Skip for now',
    };
  }
  return {
    label: '下一轮',
    title: '把这次点评直接转成下一次拍摄',
    body: '先选路径：上传已经修改后的照片来验证修正，或者换一张新照片，带着清单重拍。',
    editTitle: '上传修改后的照片，验证修正有没有生效',
    editBody: '适合你已经在外部改过裁切、曝光、白平衡或局部反差之后，用新文件和原片做对比。',
    uploadTitle: '换一张新照片，把清单真正拍出来',
    uploadBody: '适合机位、时机、背景整理、主体分离这类必须重新拍摄的改动。',
    checklistLabel: '下次拍摄清单',
    checklistTitle: '下一步建议',
    checklistBody: '我把建议压成了最先执行的动作，下一次评图先对照它们。',
    checklistEmpty: '下一轮先围绕最低分维度做一轮针对性重拍。',
    observationLabel: '观察',
    reasonLabel: '原因',
    editBadge: '修改后照片',
    uploadBadge: '新照片',
    actionCta: '带到工作台',
    goalLabel: '练习目标',
    acceptGoal: '练习这个目标',
    editGoal: '改写目标',
    alternativeGoal: '换一个目标',
    skipGoal: '暂不练习',
  };
}

export function ReviewGrowthLoopPanel({
  sourceReviewId,
  locale,
  checklist,
  actionBusy,
  onUploadEdited,
  onUploadNew,
  onChecklistAction,
  t,
}: ReviewGrowthLoopPanelProps) {
  const copy = getLoopCopy(locale);
  const [practiceEnabled, setPracticeEnabled] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editedGoal, setEditedGoal] = useState('');
  const [editing, setEditing] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const goalExposureRef = usePracticeExposure('practice_goal_shown', sourceReviewId, locale, practiceEnabled && !skipped);
  const selectedGoal = checklist[selectedIndex] ?? checklist[0];
  const effectiveGoal = useMemo(() => {
    if (!selectedGoal) return null;
    const trimmed = editedGoal.trim();
    return trimmed
      ? { ...selectedGoal, title: trimmed, detail: trimmed, observation: selectedGoal.observation, reason: selectedGoal.reason }
      : selectedGoal;
  }, [editedGoal, selectedGoal]);

  function chooseAlternative() {
    if (checklist.length < 2) return;
    setSelectedIndex((current) => (current + 1) % checklist.length);
    setEditedGoal('');
    setEditing(false);
    setSkipped(false);
  }

  useEffect(() => {
    const controller = new AbortController();
    getPracticeConfig(undefined, controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) setPracticeEnabled(config.practice_enabled);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPracticeEnabled(false);
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="ui-feature-panel p-5 sm:p-6" aria-labelledby="review-growth-loop-title">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="ui-eyebrow">{copy.label}</p>
          <h2 id="review-growth-loop-title" className="mt-2 text-2xl font-semibold leading-tight text-ink sm:text-3xl">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-2">
          <button
            type="button"
            onClick={onUploadEdited}
            disabled={actionBusy !== null}
            className="group rounded-card border border-gold/25 bg-gold/5 p-4 text-left transition-colors hover:border-gold/45 hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-gold/25 bg-surface text-gold">
                <PenLine size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="mb-2 inline-flex rounded-full border border-gold/30 bg-gold/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold/85">
                  {copy.editBadge}
                </span>
                <span className="block text-base font-semibold leading-6 text-ink">{copy.editTitle}</span>
                <span className="mt-1 block text-sm leading-6 text-ink-muted">{copy.editBody}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold">
                  {t('review_btn_upload_next')}
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={onUploadNew}
            className="group rounded-card border border-border-subtle bg-raised/60 p-4 text-left transition-colors hover:border-gold/30 hover:bg-raised"
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-control border border-border-subtle bg-surface text-ink-subtle transition-colors group-hover:text-gold">
                <Camera size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="rounded-full border border-gold/30 bg-gold/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold/85">
                  {copy.uploadBadge}
                </span>
                <span className="mt-2 block text-base font-semibold leading-6 text-ink">{copy.uploadTitle}</span>
                <span className="mt-1 block text-sm leading-6 text-ink-muted">{copy.uploadBody}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-ink transition-colors group-hover:text-gold">
                  {t('review_btn_upload_next')}
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              </span>
            </div>
          </button>
        </div>

        <div className="rounded-card border border-border-subtle bg-void/25 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <ListTodo size={15} className="text-gold" />
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-accent-muted">{copy.checklistLabel}</span>
          </div>
          <h3 className="text-lg font-semibold leading-7 text-ink">{copy.checklistTitle}</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.checklistBody}</p>

          {practiceEnabled && !skipped && effectiveGoal && (
            <div ref={goalExposureRef} className="mt-4 rounded-[22px] border border-gold/25 bg-gold/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-muted">{copy.goalLabel}</p>
              {editing ? (
                <textarea
                  value={editedGoal || effectiveGoal.detail || effectiveGoal.title}
                  maxLength={500}
                  onChange={(event) => setEditedGoal(event.target.value.slice(0, 500))}
                  className="mt-3 min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none transition-colors focus:border-gold/55"
                />
              ) : (
                <p className="mt-2 text-sm leading-7 text-ink">{effectiveGoal.detail || effectiveGoal.title}</p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onChecklistAction(effectiveGoal, selectedIndex)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control bg-action px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-action-hover"
                >
                  {copy.acceptGoal}
                  <ArrowRight size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!editing && !editedGoal) setEditedGoal(effectiveGoal.detail || effectiveGoal.title);
                    setEditing((value) => !value);
                  }}
                  className="inline-flex min-h-11 items-center rounded-control border border-border-subtle px-3 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
                >
                  {copy.editGoal}
                </button>
                {checklist.length > 1 && (
                  <button
                    type="button"
                    onClick={chooseAlternative}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-subtle px-3 py-2 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-ink"
                  >
                    <Shuffle size={13} />
                    {copy.alternativeGoal}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSkipped(true)}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-control border border-border-subtle px-3 py-2 text-sm text-ink-subtle transition-colors hover:border-rust/30 hover:text-rust"
                >
                  <X size={13} />
                  {copy.skipGoal}
                </button>
              </div>
            </div>
          )}

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
