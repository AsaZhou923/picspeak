'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPracticeSession, getMyReviews, getReview } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildNextShootChecklist } from '@/lib/review-growth';
import type { PracticeGuidanceTemplate, RetakeDimensionKey, ReviewGetResponse, ReviewHistoryItem } from '@/lib/types';
import { buildPracticeSemanticKey, clearPendingPracticeState, makePracticeIdempotencyKey, readPendingPracticeState, writePendingPracticeState } from '@/features/workspace/workspaceTaskFlow';
import { guidanceDimensionLabel } from '../guidance';
import { buildPracticeStartRequest } from '../start';

const COPY = {
  zh: { title: '开始一次有目标的练习', body: '选原片，确定要改进的一点，再上传修改后的照片或重新拍摄的照片。目标和每次结果都会保存在练习记录里。', source: '1. 选择已点评的原片', more: '加载更多照片', goal: '2. 这次想改进什么', suggested: '使用这张照片的建议', template: '也可以选一个练习模板', dimension: '重点', kind: '3. 如何完成', capture: '重新拍摄', edit: '上传修改版', captureHelp: '根据目标重新拍一张，再比较两张照片。', editHelp: '请先在你使用的修图软件中修改照片，然后上传修改版。PicSpeak 会与原片比较。', save: '保存练习并上传照片', saving: '正在保存练习…', empty: '先有一张点评过的照片，才能确定目标并比较前后变化。', first: '先评一张照片', loading: '正在加载照片…', error: '未能加载原片，请重试。', retry: '重试', selected: '已选原片', photo: '照片', placeholder: '例如：让左上角天空不再抢走主体的注意力' },
  en: { title: 'Start a focused practice', body: 'Choose an original, set one goal, then upload an edited or newly taken photo. Your goal and every result stay in your practice history.', source: '1. Choose a reviewed original', more: 'Load more photos', goal: '2. What will you improve?', suggested: 'Use the critique suggestion', template: 'Or choose a practice template', dimension: 'Focus', kind: '3. How will you practise?', capture: 'Take a new photo', edit: 'Upload an edited version', captureHelp: 'Take another photo with your goal in mind, then compare the two.', editHelp: 'Edit the photo in your photo editor first, then upload that version. PicSpeak compares it with the original.', save: 'Save practice and upload photo', saving: 'Saving practice…', empty: 'Start with a reviewed photo so you can choose a goal and compare the changes.', first: 'Get your first critique', loading: 'Loading photos…', error: 'Could not load the original. Please retry.', retry: 'Retry', selected: 'Selected original', photo: 'Photo', placeholder: 'For example: keep the bright sky from distracting from the subject' },
  ja: { title: '目標を決めて練習を始める', body: '元の写真と改善したい点を選び、編集後または撮り直した写真をアップロードします。目標と各結果は練習履歴に保存されます。', source: '1. 講評済みの元写真を選ぶ', more: '写真をさらに表示', goal: '2. 今回改善したいこと', suggested: 'この写真の改善提案を使う', template: '練習テンプレートから選ぶ', dimension: '重点', kind: '3. 練習方法', capture: '撮り直す', edit: '編集後の写真をアップロード', captureHelp: '目標を意識して撮り直し、2枚を比較します。', editHelp: 'お使いの写真編集ソフトで修正してからアップロードしてください。元写真と比較します。', save: '練習を保存して写真をアップロード', saving: '練習を保存中…', empty: 'まず1枚の写真の講評を受け、改善目標と比較の基準を用意しましょう。', first: 'まず写真の講評を受ける', loading: '写真を読み込み中…', error: '元写真を読み込めませんでした。再試行してください。', retry: '再試行', selected: '選択した元写真', photo: '写真', placeholder: '例：明るい空が主題より目立たないようにする' },
};

export default function PracticeStartPanel({ templates }: { templates: PracticeGuidanceTemplate[] }) {
  const { ensureToken } = useAuth();
  const { locale, t } = useI18n();
  const router = useRouter();
  const copy = COPY[locale];
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [source, setSource] = useState<ReviewGetResponse | null>(null);
  const [goal, setGoal] = useState('');
  const [dimension, setDimension] = useState<RetakeDimensionKey>('composition');
  const [kind, setKind] = useState<'capture_retake' | 'edit_revision'>('capture_retake');
  const [criteria, setCriteria] = useState<{ key: string; label: string }[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const savingRef = useRef(false);
  const [reload, setReload] = useState(0);

  const loadPhotos = useCallback(async (nextCursor?: string, signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const token = await ensureToken();
      if (signal?.aborted) return;
      const response = await getMyReviews(token, { limit: 20, cursor: nextCursor }, signal);
      if (signal?.aborted) return;
      const available = response.items.filter((item) => item.status === 'SUCCEEDED' && item.photo_url);
      setItems((current) => nextCursor ? [...current, ...available] : available);
      setCursor(response.next_cursor ?? null);
      setSelectedId((current) => current || available[0]?.review_id || '');
    } catch (err) {
      if (!signal?.aborted) setError(formatUserFacingError(t, err, copy.error));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [copy.error, ensureToken, t]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPhotos(undefined, controller.signal);
    return () => controller.abort();
  }, [loadPhotos]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    setLoadingSource(true);
    setSource(null);
    setError('');
    ensureToken().then((token) => getReview(selectedId, token, controller.signal)).then((review) => {
      if (controller.signal.aborted) return;
      setSource(review);
      const suggestion = buildNextShootChecklist(review.result.suggestions, 1, review.result.scores)[0];
      setGoal(suggestion?.detail || suggestion?.title || '');
      setDimension(suggestion?.dimension ?? 'composition');
      setCriteria([]);
      setTemplateId('');
    }).catch((err) => {
      if (!controller.signal.aborted) setError(formatUserFacingError(t, err, copy.error));
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingSource(false);
    });
    return () => controller.abort();
  }, [copy.error, ensureToken, reload, selectedId, t]);

  async function start() {
    if (!source || source.review_id !== selectedId || savingRef.current || goal.trim().length < 3) return;
    savingRef.current = true;
    setSaving(true);
    setError('');
    try {
      const payload = buildPracticeStartRequest({ sourceReviewId: selectedId, goal, dimension, kind, locale, criteria });
      const semanticKey = buildPracticeSemanticKey({ sourceReviewId: selectedId, goal: payload.goal_snapshot.goal, dimension, practiceKind: kind, locale, successCriteria: payload.success_criteria.map((item) => item.label) });
      const pending = readPendingPracticeState();
      const sessionIdempotencyKey = pending?.semanticKey === semanticKey ? pending.sessionIdempotencyKey : makePracticeIdempotencyKey('practice_session', semanticKey);
      writePendingPracticeState({ semanticKey, sessionIdempotencyKey });
      const token = await ensureToken();
      const session = await createPracticeSession({ ...payload, idempotency_key: sessionIdempotencyKey }, token);
      clearPendingPracticeState(semanticKey);
      router.push(`/workspace?practice_session_id=${encodeURIComponent(session.session_id)}`);
    } catch (err) {
      setError(formatUserFacingError(t, err, locale === 'zh' ? '未能保存练习，请重试。' : locale === 'ja' ? '練習を保存できませんでした。' : 'Could not save practice. Please retry.'));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return <section aria-labelledby="practice-start-title" className="rounded-card border border-border-subtle bg-raised/40 p-4 sm:p-6">
    <h2 id="practice-start-title" className="font-display text-2xl text-ink">{copy.title}</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{copy.body}</p>
    {error && <div role="alert" className="mt-4 text-sm text-rust">{error} <button type="button" className="underline" onClick={() => { void loadPhotos(); setReload((value) => value + 1); }}>{copy.retry}</button></div>}
    {loading && !items.length ? <p className="mt-4 text-sm text-ink-muted">{copy.loading}</p> : !items.length ? <div className="mt-4">
      {!error && <><p className="text-sm text-ink-muted">{copy.empty}</p><Link href="/workspace" className="ui-action-primary mt-3 inline-flex px-4 py-2 text-sm">{copy.first}</Link></>}
      {cursor && <button type="button" onClick={() => void loadPhotos(cursor)} className="mt-3 text-sm text-gold">{copy.more}</button>}
    </div> : <div className="mt-5 grid gap-6 md:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)]">
      <div>
        <label htmlFor="practice-original" className="text-sm font-semibold text-ink">{copy.source}</label>
        <select id="practice-original" value={selectedId} disabled={saving} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink">
          {items.map((item) => <option key={item.review_id} value={item.review_id}>{new Date(item.created_at).toLocaleString(locale)} · {item.final_score.toFixed(1)}</option>)}
        </select>
        {cursor && <button type="button" disabled={loading || saving} onClick={() => void loadPhotos(cursor)} className="mt-2 text-xs text-gold">{copy.more}</button>}
        {items.find((item) => item.review_id === selectedId)?.photo_url &&
          // eslint-disable-next-line @next/next/no-img-element -- Authenticated review proxy URL.
          <img src={items.find((item) => item.review_id === selectedId)?.photo_url ?? ''} alt={copy.selected} className="mt-3 max-h-56 w-full rounded-control bg-surface object-contain" />}
      </div>
      <div className="space-y-4">
        <label className="block text-sm font-semibold text-ink">{copy.goal}<textarea value={goal} maxLength={500} disabled={loadingSource || saving} onChange={(event) => { setGoal(event.target.value); setCriteria([]); setTemplateId(''); }} placeholder={copy.placeholder} className="mt-2 min-h-24 w-full rounded-control border border-border bg-surface p-3 text-sm font-normal leading-6 text-ink" /></label>
        {templates.length > 0 && <label className="block text-xs text-ink-muted">{copy.template}<select value={templateId} disabled={loadingSource || saving} onChange={(event) => {
          setTemplateId(event.target.value);
          const template = templates.find((item) => item.template_id === event.target.value);
          if (template) { setGoal(template.goal_example); setDimension(template.dimension as RetakeDimensionKey); setCriteria(template.success_criteria); }
          else if (source) { const suggestion = buildNextShootChecklist(source.result.suggestions, 1, source.result.scores)[0]; setGoal(suggestion?.detail || suggestion?.title || ''); setDimension(suggestion?.dimension ?? 'composition'); setCriteria([]); }
        }} className="mt-1 min-h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-ink"><option value="">{copy.suggested}</option>{templates.map((template) => <option key={template.template_id} value={template.template_id}>{template.title}</option>)}</select></label>}
        <label className="flex items-center gap-3 text-xs text-ink-muted">{copy.dimension}<select value={dimension} disabled={saving} onChange={(event) => setDimension(event.target.value as RetakeDimensionKey)} className="min-h-10 rounded-control border border-border bg-surface px-3 text-sm text-ink">{(['composition','lighting','color','impact','technical'] as const).map((value) => <option key={value} value={value}>{guidanceDimensionLabel(value, locale)}</option>)}</select></label>
        <fieldset><legend className="text-sm font-semibold text-ink">{copy.kind}</legend><div className="mt-2 flex flex-wrap gap-3">{(['capture_retake','edit_revision'] as const).map((value) => <label key={value} className="flex min-h-10 items-center gap-2 text-sm text-ink"><input type="radio" name="practice-start-kind" value={value} checked={kind === value} disabled={saving} onChange={() => setKind(value)} />{value === 'capture_retake' ? copy.capture : copy.edit}</label>)}</div><p className="mt-1 text-xs leading-5 text-ink-muted">{kind === 'capture_retake' ? copy.captureHelp : copy.editHelp}</p></fieldset>
        <button type="button" disabled={saving || loadingSource || !source || source.review_id !== selectedId || goal.trim().length < 3} onClick={() => void start()} className="ui-action-primary min-h-11 px-4 py-2 text-sm disabled:opacity-50">{saving ? copy.saving : copy.save}</button>
      </div>
    </div>}
  </section>;
}
