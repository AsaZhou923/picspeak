'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Search, Tags } from 'lucide-react';
import type { ReviewHistoryItem } from '@/lib/types';
import {
  REVIEW_ORGANIZATION_NOTE_MAX_LENGTH,
  REVIEW_ORGANIZATION_TAG_LIMIT,
  REVIEW_ORGANIZATION_TAG_MAX_LENGTH,
  buildReviewOrganizationPayload,
  draftFromReviewOrganization,
  reviewOrganizationDraftIsDirty,
  reviewOrganizationTagDraftStats,
  type ReviewOrganizationDraft,
} from '@/features/reviews/reviewOrganization';

type Locale = 'zh' | 'en' | 'ja';
export type ReviewOrganizationPanelItem = Pick<ReviewHistoryItem, 'review_id' | 'tags' | 'note' | 'created_at' | 'final_score'>;

const COPY: Record<Locale, {
  title: string;
  body: string;
  selected: string;
  noSelection: string;
  tags: string;
  tagsHint: string;
  note: string;
  noteHint: string;
  save: string;
  cancel: string;
  saving: string;
  saved: string;
  empty: string;
  searchTitle: string;
  discardDraft: string;
  unsaved: string;
  tagOverflow: (extra: number, tooLong: number) => string;
}> = {
  zh: {
    title: '私人整理',
    body: '标签和备注只用于你的历史回看，不会进入公开长廊或分享页。',
    selected: '正在整理',
    noSelection: '选择一条点评后编辑标签和备注。',
    tags: '标签',
    tagsHint: '最多 8 个，每个 32 字以内，用逗号、换行或 # 分隔。',
    note: '备注',
    noteHint: '最多 1000 字；留空并保存会清空备注。',
    save: '保存整理',
    cancel: '取消草稿',
    saving: '保存中',
    saved: '已保存',
    empty: '没有可整理的点评。',
    searchTitle: '私有搜索',
    discardDraft: '当前标签或备注还没保存。放弃草稿并切换吗？',
    unsaved: '有未保存草稿',
    tagOverflow: (extra, tooLong) => `标签超出限制：多出 ${extra} 个，过长 ${tooLong} 个。请删减后再保存。`,
  },
  en: {
    title: 'Private Organization',
    body: 'Tags and notes stay in your private history. They are never added to public Gallery or share pages.',
    selected: 'Organizing',
    noSelection: 'Choose a critique to edit its tags and note.',
    tags: 'Tags',
    tagsHint: 'Up to 8 tags, 32 characters each. Separate with commas, new lines, or #.',
    note: 'Note',
    noteHint: 'Up to 1000 characters. Saving an empty note clears it.',
    save: 'Save private notes',
    cancel: 'Discard draft',
    saving: 'Saving',
    saved: 'Saved',
    empty: 'No critiques to organize.',
    searchTitle: 'Private Search',
    discardDraft: 'Tags or note have unsaved edits. Discard this draft and switch?',
    unsaved: 'Unsaved draft',
    tagOverflow: (extra, tooLong) => `Tag limits exceeded: ${extra} extra, ${tooLong} too long. Trim before saving.`,
  },
  ja: {
    title: '非公開整理',
    body: 'タグとメモは自分の履歴用です。公開ギャラリーや共有ページには出ません。',
    selected: '整理中',
    noSelection: 'タグとメモを編集する講評を選んでください。',
    tags: 'タグ',
    tagsHint: '最大 8 個、各 32 文字まで。カンマ、改行、# で区切れます。',
    note: 'メモ',
    noteHint: '最大 1000 文字。空で保存するとメモを消去します。',
    save: '非公開メモを保存',
    cancel: '下書きを破棄',
    saving: '保存中',
    saved: '保存済み',
    empty: '整理できる講評がありません。',
    searchTitle: '非公開検索',
    discardDraft: 'タグまたはメモに未保存の変更があります。下書きを破棄して切り替えますか？',
    unsaved: '未保存の下書きがあります',
    tagOverflow: (extra, tooLong) => `タグ制限超過：超過 ${extra} 個、長すぎるタグ ${tooLong} 個。保存前に調整してください。`,
  },
};

export function ReviewOrganizationPanel({
  item,
  items,
  locale,
  busy,
  status,
  showItemSelect = true,
  onSelect,
  onSave,
}: {
  item: ReviewOrganizationPanelItem | null;
  items: ReviewOrganizationPanelItem[];
  locale: string;
  busy: boolean;
  status: string;
  showItemSelect?: boolean;
  onSelect: (reviewId: string) => void;
  onSave: (payload: { tags: string[]; note: string }) => Promise<void>;
}) {
  const copy = COPY[(locale as Locale) in COPY ? locale as Locale : 'en'];
  const [draft, setDraft] = useState<ReviewOrganizationDraft>(() => draftFromReviewOrganization(item?.tags, item?.note));
  const tagStats = useMemo(() => reviewOrganizationTagDraftStats(draft.tagsText), [draft.tagsText]);
  const dirty = reviewOrganizationDraftIsDirty(draft, item?.tags, item?.note);
  const noteLength = draft.note.length;

  useEffect(() => {
    setDraft(draftFromReviewOrganization(item?.tags, item?.note));
  }, [item?.review_id, item?.tags, item?.note]);

  const handleCancel = () => {
    setDraft(draftFromReviewOrganization(item?.tags, item?.note));
  };

  const handleSave = async () => {
    if (tagStats.hasOverflow) return;
    await onSave(buildReviewOrganizationPayload(draft));
  };

  const confirmDiscard = useCallback(() => !dirty || window.confirm(copy.discardDraft), [copy.discardDraft, dirty]);

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const clickGuard = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      if (confirmDiscard()) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('click', clickGuard, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('click', clickGuard, true);
    };
  }, [confirmDiscard, dirty]);

  return (
    <section className="ui-panel mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-ink">
            <Tags size={15} className="text-sage" />
            <span>{copy.title}</span>
          </div>
          <p className="max-w-2xl text-xs leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-void/40 px-3 py-1 text-[11px] text-ink-subtle">
          <Search size={12} />
          {copy.searchTitle}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-ink-subtle">{copy.empty}</p>
      ) : (
        <div className={`grid gap-4 ${showItemSelect ? 'lg:grid-cols-[minmax(180px,0.72fr)_minmax(0,1.28fr)]' : ''}`}>
          {showItemSelect && (
            <label className="space-y-2 text-xs text-ink-muted">
              <span>{copy.selected}</span>
              <select
                value={item?.review_id ?? ''}
                onChange={(event) => {
                  if (!confirmDiscard()) return;
                  onSelect(event.target.value);
                }}
                className="min-h-11 w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
              >
                <option value="">{copy.noSelection}</option>
                {items.map((entry) => (
                  <option key={entry.review_id} value={entry.review_id}>
                    {new Date(entry.created_at).toLocaleDateString()} · {entry.final_score.toFixed(1)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <label className="space-y-2 text-xs text-ink-muted">
              <span>{copy.tags}</span>
              <textarea
                value={draft.tagsText}
                onChange={(event) => setDraft((prev) => ({ ...prev, tagsText: event.target.value }))}
                disabled={!item}
                rows={4}
                className="w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40 disabled:opacity-50"
              />
              <p className="text-[11px] leading-5 text-ink-subtle">
                {copy.tagsHint} {tagStats.accepted.length}/{REVIEW_ORGANIZATION_TAG_LIMIT}, {REVIEW_ORGANIZATION_TAG_MAX_LENGTH}
              </p>
              {tagStats.hasOverflow && (
                <p className="text-[11px] leading-5 text-rust">
                  {copy.tagOverflow(tagStats.overLimitCount, tagStats.tooLongCount)}
                </p>
              )}
            </label>

            <label className="space-y-2 text-xs text-ink-muted">
              <span>{copy.note}</span>
              <textarea
                value={draft.note}
                onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value.slice(0, REVIEW_ORGANIZATION_NOTE_MAX_LENGTH) }))}
                disabled={!item}
                rows={4}
                className="w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40 disabled:opacity-50"
              />
              <p className="text-[11px] leading-5 text-ink-subtle">
                {copy.noteHint} {noteLength}/{REVIEW_ORGANIZATION_NOTE_MAX_LENGTH}
              </p>
            </label>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!item || busy || tagStats.hasOverflow}
          className="ui-action-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={13} />
          {busy ? copy.saving : copy.save}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={!item || busy}
          className="ui-action-secondary px-4 py-2 text-sm disabled:opacity-50"
        >
          <RotateCcw size={13} />
          {copy.cancel}
        </button>
        {dirty && <span className="text-xs text-gold">{copy.unsaved}</span>}
        {status && <span className="text-xs text-sage">{status === 'saved' ? copy.saved : status}</span>}
      </div>
    </section>
  );
}
