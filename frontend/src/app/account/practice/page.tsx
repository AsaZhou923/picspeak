'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle2, RefreshCw } from 'lucide-react';
import {
  createPracticeSession,
  getPracticeGuidanceProfile,
  getPracticeRecommendations,
  getPracticeSessions,
  updatePracticeSceneGroup,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import PracticeStartPanel from '@/features/practice/components/PracticeStartPanel';
import { usePracticeEnabled } from '@/features/practice/usePracticeEnabled';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import type {
  PracticeGuidanceProfileResponse,
  PracticeRecommendation,
  PracticeRecommendationsResponse,
  PracticeSessionListItem,
  RetakeDimensionKey,
} from '@/lib/types';
import {
  buildPracticeSemanticKey,
  clearPendingPracticeState,
  makePracticeIdempotencyKey,
  readPendingPracticeState,
  writePendingPracticeState,
} from '@/features/workspace/workspaceTaskFlow';
import {
  coverageFacts,
  getPracticeGuidanceCopy,
  guidanceDimensionLabel,
  guidanceLevelMessage,
  guidanceLevelReasonLabel,
  guidanceStatusLabel,
  localizePracticeDimensionText,
  nextRecommendationIndex,
  observationEvidenceLabel,
  recommendationActionLabel,
} from '@/features/practice/guidance';

async function loadAllPracticeSessions(
  token: string,
  signal?: AbortSignal
): Promise<PracticeSessionListItem[]> {
  const items: PracticeSessionListItem[] = [];
  let cursor: string | null | undefined;
  do {
    const page = await getPracticeSessions(token, { limit: 100, cursor: cursor ?? undefined }, signal);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor && !signal?.aborted);
  return items;
}

function acceptSemanticKey(recommendation: PracticeRecommendation): string | null {
  const payload = recommendation.accept_payload;
  if (!payload) return null;
  return buildPracticeSemanticKey({
    sourceReviewId: payload.source_review_id,
    goal: payload.goal_snapshot.goal,
    successCriteria: payload.success_criteria.map((criterion) => criterion.label),
    dimension: payload.goal_snapshot.dimension,
    practiceKind: payload.practice_kind,
    locale: payload.locale,
  });
}

export default function PracticeAccountPage() {
  const router = useRouter();
  const { ensureToken, userInfo } = useAuth();
  const practiceEnabled = usePracticeEnabled();
  const { t, locale } = useI18n();
  const copy = useMemo(() => getPracticeGuidanceCopy(locale), [locale]);
  const loadError = locale === 'zh' ? '未能加载练习记录，请重试。' : locale === 'ja' ? '練習履歴を読み込めませんでした。' : 'Could not load practice records. Please retry.';
  const flowCopy = locale === 'zh'
    ? { recent: '我的练习', start: '开始新练习', continue: '继续练习', result: '查看结果', pending: '查看进度', details: '查看记录', attempts: '次尝试', insights: '练习观察与场景整理', empty: '还没有保存的练习。从已有点评选一张原片，确定目标后就会出现在这里。' }
    : locale === 'ja'
      ? { recent: '自分の練習', start: '新しい練習', continue: '練習を続ける', result: '結果を見る', pending: '進捗を見る', details: '履歴を見る', attempts: '回の試行', insights: '練習の観察とシーン整理', empty: '保存された練習はまだありません。講評済みの元写真を選び、目標を保存するとここに表示されます。' }
      : { recent: 'My practice', start: 'Start a new practice', continue: 'Continue practice', result: 'View result', pending: 'View progress', details: 'View record', attempts: 'attempts', insights: 'Practice observations and scenes', empty: 'No saved practice yet. Choose a reviewed original and save a goal to see it here.' };
  const requestIdRef = useRef(0);
  const [profile, setProfile] = useState<PracticeGuidanceProfileResponse | null>(null);
  const [recommendations, setRecommendations] = useState<PracticeRecommendationsResponse | null>(null);
  const [practiceSessions, setPracticeSessions] = useState<PracticeSessionListItem[]>([]);
  const [recommendationIndex, setRecommendationIndex] = useState(0);
  const [sceneDrafts, setSceneDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [startOpen, setStartOpen] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [acceptingRecommendationId, setAcceptingRecommendationId] = useState<string | null>(null);
  const [savingSceneSessionId, setSavingSceneSessionId] = useState<string | null>(null);
  const [savedSceneSessionId, setSavedSceneSessionId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const isCurrent = () => requestIdRef.current === requestId && !signal?.aborted;
    setLoading(true);
    setError('');
    try {
      const token = await ensureToken();
      if (!isCurrent()) return;
      if (!token) {
        setProfile(null);
        setRecommendations(null);
        setPracticeSessions([]);
        setSceneDrafts({});
        return;
      }
      const [nextProfile, nextRecommendations, nextPracticeSessions] = await Promise.allSettled([
        getPracticeGuidanceProfile(token, locale, signal),
        getPracticeRecommendations(token, locale, signal),
        loadAllPracticeSessions(token, signal),
      ]);
      if (!isCurrent()) return;
      setProfile(nextProfile.status === 'fulfilled' ? nextProfile.value : null);
      setRecommendations(nextRecommendations.status === 'fulfilled' ? nextRecommendations.value : null);
      if (nextPracticeSessions.status === 'rejected') throw nextPracticeSessions.reason;
      setPracticeSessions(nextPracticeSessions.value);
      setSceneDrafts((current) => {
        const next: Record<string, string> = {};
        for (const session of nextPracticeSessions.value) {
          next[session.session_id] = current[session.session_id] ?? session.scene_group ?? '';
        }
        return next;
      });
      setRecommendationIndex(0);
    } catch (err) {
      if (!isCurrent()) return;
      setError(formatUserFacingError(t, err, loadError));
    } finally {
      if (isCurrent()) setLoading(false);
    }
  }, [ensureToken, loadError, locale, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleAcceptRecommendation = useCallback(async (recommendation: PracticeRecommendation) => {
    const payload = recommendation.accept_payload;
    const semanticKey = acceptSemanticKey(recommendation);
    if (!payload || !semanticKey || !recommendation.accept_available || acceptingRecommendationId) return;

    setActionError('');
    setAcceptingRecommendationId(recommendation.recommendation_id);
    try {
      const token = await ensureToken();
      if (!token) {
        setActionError(copy.signInRequired);
        return;
      }
      const pending = readPendingPracticeState();
      const sessionIdempotencyKey = pending?.semanticKey === semanticKey
        ? pending.sessionIdempotencyKey
        : makePracticeIdempotencyKey('practice_session', semanticKey);
      writePendingPracticeState({ semanticKey, sessionIdempotencyKey });
      const session = await createPracticeSession({ ...payload, idempotency_key: sessionIdempotencyKey }, token);
      clearPendingPracticeState(semanticKey);
      router.push(`/workspace?practice_session_id=${encodeURIComponent(session.session_id)}`);
    } catch (err) {
      setActionError(formatUserFacingError(t, err, copy.acceptError));
    } finally {
      setAcceptingRecommendationId(null);
    }
  }, [acceptingRecommendationId, copy.acceptError, copy.signInRequired, ensureToken, router, t]);

  const handleSaveSceneGroup = useCallback(async (sessionId: string) => {
    const label = (sceneDrafts[sessionId] ?? '').trim();
    if (!label) {
      setActionError(copy.sceneGroupRequired);
      return;
    }
    setActionError('');
    setSavedSceneSessionId(null);
    setSavingSceneSessionId(sessionId);
    try {
      const token = await ensureToken();
      if (!token) {
        setActionError(copy.signInRequired);
        return;
      }
      await updatePracticeSceneGroup(sessionId, { label }, token);
      setSavedSceneSessionId(sessionId);
      await load();
    } catch (err) {
      setActionError(formatUserFacingError(t, err, copy.sceneGroupError));
    } finally {
      setSavingSceneSessionId(null);
    }
  }, [copy.sceneGroupError, copy.sceneGroupRequired, copy.signInRequired, ensureToken, load, sceneDrafts, t]);

  const coverage = profile?.coverage;
  const levelMessage = profile ? guidanceLevelMessage(profile.level, profile.level_reason, locale) : copy.recordsOnly;
  const levelReason = profile ? guidanceLevelReasonLabel(profile.level_reason, locale) : copy.recordsOnly;
  const recommendationItems = recommendations?.recommendations ?? [];
  const activeRecommendation = recommendationItems[recommendationIndex] ?? null;
  const actionBusy = Boolean(acceptingRecommendationId || savingSceneSessionId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gold">{flowCopy.recent}</p>
          <h1 className="mt-2 font-display text-3xl text-ink sm:text-4xl">{copy.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-subtle">{copy.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-border px-4 py-2 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-gold"
        >
          <RefreshCw size={15} />
          {error ? copy.retry : copy.refresh}
        </button>
      </header>

      <nav aria-label={copy.title} className="flex flex-wrap gap-x-6 gap-y-3 border-y border-border-subtle py-4 text-sm">
        <Link href="/account/reviews?view=practice" className="font-medium text-gold hover:underline">{copy.viewLog}</Link>
        {userInfo && userInfo.plan !== 'guest' && <>
          <Link href="/account/reviews" className="text-ink-muted hover:text-ink">{copy.photoHistory}</Link>
          <Link href="/account/profile" className="text-ink-muted hover:text-ink">{copy.publicPortfolio}</Link>
        </>}
      </nav>

      {loading && practiceSessions.length === 0 && <p role="status" className="text-sm text-ink-muted">{copy.loading}</p>}

      {!loading && practiceSessions.length > 0 && (
        <section aria-labelledby="recent-practice-heading">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="recent-practice-heading" className="text-lg font-semibold text-ink">{flowCopy.recent}</h2>
            <Link href="/account/reviews?view=practice" className="text-sm text-gold">{copy.viewLog}</Link>
          </div>
          <div className="space-y-3">
            {practiceSessions.slice(0, 6).map((session) => {
              const latest = session.latest_attempt;
              const resultHref = latest?.review_id && latest.review_access === 'available' ? `/reviews/${latest.review_id}` : null;
              const taskHref = !resultHref && latest?.task_id && session.latest_assessment_status !== 'failed' ? `/tasks/${latest.task_id}` : null;
              return <article key={session.session_id} className="rounded-card border border-border-subtle bg-raised/40 p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                  <span>{guidanceDimensionLabel(session.dimension, locale)}</span><span>·</span>
                  <span>{session.attempt_count} {flowCopy.attempts}</span><span>·</span>
                  <time dateTime={session.created_at}>{new Date(session.created_at).toLocaleDateString(locale)}</time>
                </div>
                <p className="mt-2 text-sm font-medium leading-6 text-ink">{session.goal}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-sm">
                  {resultHref && <Link href={resultHref} className="font-medium text-gold">{flowCopy.result}</Link>}
                  {taskHref && <Link href={taskHref} className="font-medium text-gold">{flowCopy.pending}</Link>}
                  {practiceEnabled && session.continue_available && <Link href={`/workspace?practice_session_id=${encodeURIComponent(session.session_id)}`} className="font-medium text-gold">{flowCopy.continue}</Link>}
                  <Link href={`/account/reviews?view=practice&session_id=${encodeURIComponent(session.session_id)}`} className="text-ink-muted hover:text-ink">{flowCopy.details}</Link>
                </div>
              </article>;
            })}
          </div>
        </section>
      )}

      {!loading && !error && practiceEnabled === true && (
        practiceSessions.length === 0
          ? <PracticeStartPanel templates={profile?.templates ?? []} />
          : <details className="rounded-card border border-border-subtle" onToggle={(event) => setStartOpen(event.currentTarget.open)}>
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ink">{flowCopy.start}</summary>
              {startOpen && <PracticeStartPanel templates={profile?.templates ?? []} />}
            </details>
      )}
      {!loading && !error && practiceEnabled === false && practiceSessions.length === 0 && <p className="text-sm text-ink-muted">{copy.noPracticeRecords}</p>}

      {(error || actionError) && (
        <div className="flex items-start gap-3 rounded-card border border-danger/35 bg-danger/10 p-4 text-sm text-danger">
          <AlertCircle size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-2">
            {error && <p>{error}</p>}
            {actionError && <p>{actionError}</p>}
            <button type="button" onClick={() => void load()} className="font-medium text-danger underline underline-offset-4">
              {copy.retry}
            </button>
          </div>
        </div>
      )}

      {practiceSessions.length > 0 && <details className="rounded-card border border-border-subtle">
        <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-ink">{flowCopy.insights}</summary>
        <div className="space-y-5 p-4 pt-0">
      <section className="rounded-card border border-border-subtle bg-raised/45 p-5">
        {loading && !profile ? (
          <p className="text-sm text-ink-subtle">{copy.loading}</p>
        ) : (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-ink">{levelMessage}</p>
                <p className="mt-1 text-xs text-ink-muted">{levelReason}</p>
              </div>
              <Link
                href="/account/reviews?view=practice"
                className="inline-flex items-center gap-2 text-sm font-medium text-gold hover:text-action"
              >
                {copy.viewLog}
                <ArrowRight size={14} />
              </Link>
            </div>

            {coverage && (
              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {coverageFacts(coverage, locale).map((fact) => (
                  <div key={fact.label} className="rounded-card border border-border-subtle bg-void/35 p-3">
                    <p className="text-2xl font-semibold text-ink">{fact.value}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.14em] text-ink-muted">{fact.label}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section className="rounded-card border border-border-subtle bg-raised/35 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">{copy.sceneGroups}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-subtle">{copy.sceneGroupsHelp}</p>
          </div>
          <Link href="/account/reviews?view=practice" className="inline-flex items-center gap-2 text-sm font-medium text-gold hover:text-action">
            {copy.viewLog}
            <ArrowRight size={14} />
          </Link>
        </div>
        {practiceSessions.length === 0 ? (
          <p className="mt-4 text-sm leading-6 text-ink-subtle">{copy.sceneGroupsEmpty}</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {practiceSessions.map((session) => {
              const saving = savingSceneSessionId === session.session_id;
              const saved = savedSceneSessionId === session.session_id;
              const draft = sceneDrafts[session.session_id] ?? '';
              return (
                <article key={session.session_id} className="rounded-card border border-border-subtle bg-void/35 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-xs text-gold">
                      {guidanceDimensionLabel(session.dimension, locale)}
                    </span>
                    <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-ink-muted">
                      {session.scene_group || copy.scenePending}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm font-medium leading-6 text-ink">{session.goal}</p>
                  <label className="mt-4 block text-xs font-medium uppercase tracking-[0.12em] text-ink-muted" htmlFor={`scene-${session.session_id}`}>
                    {copy.sceneGroupLabel}
                  </label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input
                      id={`scene-${session.session_id}`}
                      value={draft}
                      onChange={(event) => setSceneDrafts((current) => ({ ...current, [session.session_id]: event.target.value }))}
                      placeholder={copy.sceneGroupPlaceholder}
                      className="min-h-10 flex-1 rounded-control border border-border-subtle bg-void px-3 text-sm text-ink outline-none transition-colors placeholder:text-ink-faint focus:border-gold/45"
                    />
                    <button
                      type="button"
                      disabled={saving || !draft.trim()}
                      onClick={() => void handleSaveSceneGroup(session.session_id)}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-gold disabled:border-border-subtle disabled:text-ink-faint"
                    >
                      {saved && !saving ? <CheckCircle2 size={15} /> : null}
                      {saving ? copy.sceneGroupSaving : saved ? copy.sceneGroupSaved : copy.sceneGroupSave}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="rounded-card border border-border-subtle bg-raised/35 p-5">
          <h2 className="text-lg font-semibold text-ink">{copy.evidence}</h2>
          {!profile || profile.observations.length === 0 ? (
            <p className="mt-3 text-sm leading-6 text-ink-subtle">{levelMessage}</p>
          ) : (
            <div className="mt-4 space-y-3">
              {profile.observations.map((observation) => (
                <article key={observation.observation_id} className="rounded-card border border-border-subtle bg-void/35 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{localizePracticeDimensionText(observation.title, locale)}</p>
                      <p className="mt-1 text-sm leading-6 text-ink-subtle">{localizePracticeDimensionText(observation.body, locale)}</p>
                    </div>
                    <span className="rounded-full border border-sage/25 bg-sage/10 px-2.5 py-1 text-xs text-sage">
                      {guidanceDimensionLabel(observation.dimension, locale)}
                    </span>
                  </div>
                  <p className="mt-3 text-xs text-ink-muted">{observationEvidenceLabel(observation, locale)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {observation.evidence.map((item) => (
                      <Link
                        key={item.attempt_id}
                        href={`/reviews/${item.review_id}`}
                        className="rounded-full border border-border-subtle px-2.5 py-1 text-xs text-ink-muted hover:border-gold/35 hover:text-gold"
                      >
                        {guidanceStatusLabel(item.status, locale)} · {item.scene_group ?? copy.scenePending}
                      </Link>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>

        <aside className="rounded-card border border-border-subtle bg-raised/35 p-5">
          <h2 className="text-lg font-semibold text-ink">{copy.recommendations}</h2>
          {!activeRecommendation ? (
            <p className="mt-3 text-sm leading-6 text-ink-subtle">{copy.noRecommendations}</p>
          ) : (
            <div className="mt-4 space-y-3">
              <article key={activeRecommendation.recommendation_id} className="rounded-card border border-border-subtle bg-void/35 p-4">
                <p className="text-sm font-semibold text-ink">{localizePracticeDimensionText(activeRecommendation.title, locale)}</p>
                <p className="mt-2 text-sm leading-6 text-ink-subtle">{localizePracticeDimensionText(activeRecommendation.reason, locale)}</p>
                <p className="mt-3 text-xs text-ink-muted">{activeRecommendation.goal_snapshot.goal}</p>
                <button
                  type="button"
                  disabled={actionBusy || !activeRecommendation.accept_available || !activeRecommendation.accept_payload}
                  onClick={() => void handleAcceptRecommendation(activeRecommendation)}
                  className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-control border border-gold/35 px-3 py-2 text-sm font-medium text-gold disabled:border-border-subtle disabled:text-ink-muted"
                >
                  {acceptingRecommendationId === activeRecommendation.recommendation_id
                    ? copy.acceptBusy
                    : recommendationActionLabel(activeRecommendation, locale)}
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeRecommendation.skip_available && recommendationItems.length > 1 && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => setRecommendationIndex((value) => nextRecommendationIndex(value, recommendationItems.length))}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-ink-muted hover:border-gold/35 hover:text-gold disabled:text-ink-faint"
                    >
                      {copy.skip}
                    </button>
                  )}
                  {activeRecommendation.change_goal_available && recommendationItems.length > 1 && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => setRecommendationIndex((value) => nextRecommendationIndex(value, recommendationItems.length))}
                      className="rounded-full border border-border-subtle px-3 py-1 text-xs text-ink-muted hover:border-gold/35 hover:text-gold disabled:text-ink-faint"
                    >
                      {copy.changeGoal}
                    </button>
                  )}
                </div>
              </article>
            </div>
          )}
        </aside>
      </section>

        </div>
      </details>}

    </div>
  );
}
