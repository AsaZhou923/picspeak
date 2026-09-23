'use client';

import Link from 'next/link';
import { AlertCircle, Archive, CheckCircle2, ChevronRight, Clock3, RefreshCw, Target, Undo2 } from 'lucide-react';
import {
  attemptDisplayState,
  canContinuePractice,
  latestAttempt,
  latestPracticeAssessment,
  latestPracticeDate,
  practiceJournalAttemptState,
  practiceLifecycleActions,
  practiceContinuationId,
  sessionDimension,
  sessionGenre,
  sessionGoal,
  sessionAttemptCount,
  sessionSourceAccess,
  sourceAccessCopyKey,
  type PracticeJournalCopy,
  type PracticeJournalItem,
} from '@/features/practice/journal';
import { getHistoryIntlLocale } from '@/lib/review-history-copy';
import type {
  PracticeAttemptSummary,
  PracticeLifecycle,
  PracticeSessionResponse,
  PracticeSummaryResponse,
  RetakeDimensionKey,
  ReviewHistoryItem,
} from '@/lib/types';

function formatDate(value: string | null | undefined, locale: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString(getHistoryIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toneForAssessment(status: string): string {
  if (status === 'achieved') return 'border-sage/30 bg-sage/10 text-sage';
  if (status === 'partial') return 'border-gold/30 bg-gold/10 text-gold';
  if (status === 'not_achieved') return 'border-rust/30 bg-rust/10 text-rust';
  return 'border-border bg-raised/70 text-ink-muted';
}

function toneForAttempt(attempt: PracticeAttemptSummary | null): string {
  const state = attempt ? attemptDisplayState(attempt) : 'pending';
  if (state === 'success') return 'border-sage/30 bg-sage/10 text-sage';
  if (state === 'failed') return 'border-rust/30 bg-rust/10 text-rust';
  return 'border-border bg-raised/70 text-ink-muted';
}

export function PracticeSummaryPanel({
  summary,
  copy,
  labels,
  locale,
  loading,
  error,
  onRetry,
}: {
  summary: PracticeSummaryResponse | null;
  copy: {
    title: string;
    body: string;
    sessions: string;
    attempts: string;
    samples: string;
    indeterminate: string;
    range: string;
    allScope: string;
    unavailable: string;
    loading: string;
    retry: string;
  };
  labels: PracticeJournalCopy;
  locale: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (!summary || error) {
    return (
      <section className="ui-panel mb-6 flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="text-sm text-ink-muted">{loading && !error ? copy.loading : error || copy.unavailable}</p>
        {!loading && (
          <button type="button" onClick={onRetry} className="ui-action-secondary px-3 py-1.5 text-xs">
            {copy.retry}
          </button>
        )}
      </section>
    );
  }

  const counts = summary.status_counts;

  return (
    <section className="ui-panel mb-6 p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ui-eyebrow mb-2">{copy.allScope}</p>
          <h2 className="font-display text-2xl text-ink">{copy.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-muted">{copy.body}</p>
        </div>
        <p className="rounded-full border border-border bg-raised/70 px-3 py-1 text-xs text-ink-muted">
          {copy.range}: {formatDate(summary.timeframe.start_at, locale)} - {formatDate(summary.timeframe.end_at, locale)}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border-subtle bg-raised/70 p-4">
          <p className="text-xs text-ink-subtle">{copy.sessions}</p>
          <p className="mt-2 font-display text-3xl text-ink">{summary.session_count}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-raised/70 p-4">
          <p className="text-xs text-ink-subtle">{copy.attempts}</p>
          <p className="mt-2 font-display text-3xl text-ink">{summary.attempt_count}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-raised/70 p-4">
          <p className="text-xs text-ink-subtle">{copy.samples}</p>
          <p className="mt-2 font-display text-3xl text-ink">{summary.sample_count}</p>
        </div>
        <div className="rounded-lg border border-border-subtle bg-raised/70 p-4">
          <p className="text-xs text-ink-subtle">{copy.indeterminate}</p>
          <p className="mt-2 font-display text-3xl text-ink">{summary.indeterminate_count}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {(['achieved', 'partial', 'not_achieved', 'indeterminate'] as const).map((status) => (
          <span key={status} className={`rounded-full border px-3 py-1 text-xs ${toneForAssessment(status)}`}>
            {labels.assessment[status]} · {counts[status] ?? 0}
          </span>
        ))}
        <span className={`rounded-full border px-3 py-1 text-xs ${toneForAssessment('unknown')}`}>
          {labels.assessment.unknown} · {summary.unknown_count}
        </span>
        <span className={`rounded-full border px-3 py-1 text-xs ${toneForAssessment('failed')}`}>
          {labels.assessment.failed} · {summary.failed_count}
        </span>
      </div>
    </section>
  );
}

export function PracticeSessionCard({
  item,
  copy,
  labels,
  dimensionLabel,
  genreLabel,
  locale,
  selected,
  busyLifecycle,
  onSelect,
  onLifecycle,
}: {
  item: PracticeJournalItem;
  copy: {
    attempts: string;
    latest: string;
    continue: string;
    viewDetail: string;
    readonly: string;
    archive: string;
    restore: string;
    complete: string;
  };
  labels: PracticeJournalCopy;
  dimensionLabel: (dimension: RetakeDimensionKey) => string;
  genreLabel: (genre: string | null) => string | null;
  locale: string;
  selected: boolean;
  busyLifecycle: boolean;
  onSelect: () => void;
  onLifecycle: (lifecycle: PracticeLifecycle) => void;
}) {
  const assessment = latestPracticeAssessment(item);
  const attemptState = practiceJournalAttemptState(item);
  const sourceCopy = labels.sourceAccess[sourceAccessCopyKey(sessionSourceAccess(item))] ?? labels.sourceAccess.available;
  const canContinue = canContinuePractice(item);
  const continuationId = practiceContinuationId(item);
  const dimension = sessionDimension(item) as RetakeDimensionKey;
  const genre = genreLabel(sessionGenre(item));
  const actions = practiceLifecycleActions(item.lifecycle);

  return (
    <article className={`rounded-lg border bg-raised px-4 py-4 transition-colors ${selected ? 'border-gold/45' : 'border-border-subtle'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 text-left">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
              <Target size={12} />
              {dimensionLabel(dimension)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">
              {labels.kind[item.practice_kind]}
            </span>
            {genre && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">
                {genre}
              </span>
            )}
            <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-ink-muted">
              {labels.lifecycle[item.lifecycle]}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toneForAssessment(assessment)}`}>
              {labels.assessment[assessment]}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${attemptState === 'success' ? 'border-sage/30 bg-sage/10 text-sage' : attemptState === 'failed' ? 'border-rust/30 bg-rust/10 text-rust' : 'border-border bg-void/30 text-ink-muted'}`}>
              {labels.attemptState[attemptState]}
            </span>
          </div>
          <p className="break-words text-sm font-semibold leading-6 text-ink">{sessionGoal(item)}</p>
          <p className="mt-2 text-xs text-ink-subtle">
            {copy.attempts}: {sessionAttemptCount(item)} · {copy.latest}: {formatDate(latestPracticeDate(item), locale)} · {sourceCopy}
          </p>
        </button>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          {canContinue ? (
            <Link
              href={`/workspace?practice_session_id=${encodeURIComponent(continuationId ?? item.session_id)}`}
              className="ui-action-primary px-3 py-1.5 text-xs"
            >
              {copy.continue}
              <ChevronRight size={12} />
            </Link>
          ) : (
            <span className="rounded-full border border-border bg-void/40 px-3 py-1.5 text-xs text-ink-subtle">
              {copy.readonly}
            </span>
          )}
          <button type="button" onClick={onSelect} className="ui-action-secondary px-3 py-1.5 text-xs">
            {copy.viewDetail}
          </button>
          {actions.canComplete && (
            <button type="button" disabled={busyLifecycle} onClick={() => onLifecycle('completed')} className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50">
              <CheckCircle2 size={12} />
              {copy.complete}
            </button>
          )}
          {actions.canArchive && (
            <button type="button" disabled={busyLifecycle} onClick={() => onLifecycle('archived')} className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50">
              <Archive size={12} />
              {copy.archive}
            </button>
          )}
          {actions.canRestore && (
            <button type="button" disabled={busyLifecycle} onClick={() => onLifecycle('active')} className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50">
              <Undo2 size={12} />
              {copy.restore}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export function PracticeSessionDetail({
  session,
  copy,
  labels,
  locale,
  loading,
  error,
  onRetry,
}: {
  session: PracticeSessionResponse | null;
  copy: {
    detailTitle: string;
    criteria: string;
    timeline: string;
    noAttempts: string;
    task: string;
    review: string;
    error: string;
    retry: string;
  };
  labels: PracticeJournalCopy;
  locale: string;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <section className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
        <span>{error}</span>
        <button type="button" onClick={onRetry} disabled={loading} className="ui-action-secondary px-3 py-1.5 text-xs disabled:opacity-50">
          {copy.retry}
        </button>
      </section>
    );
  }

  if (!session) return null;

  return (
    <section className="mt-3 rounded-lg border border-border-subtle bg-void/30 p-4">
      <h3 className="font-display text-xl text-ink">{copy.detailTitle}</h3>
      <p className="mt-2 break-words text-sm leading-6 text-ink-muted">{session.goal_snapshot.goal}</p>
      {session.success_criteria.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs uppercase tracking-[0.16em] text-ink-subtle">{copy.criteria}</p>
          <ul className="space-y-2">
            {session.success_criteria.map((criterion) => (
              <li key={criterion.key} className="rounded-lg border border-border-subtle bg-raised/70 px-3 py-2 text-sm text-ink-muted">
                {criterion.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-5">
        <p className="mb-2 text-xs uppercase tracking-[0.16em] text-ink-subtle">{copy.timeline}</p>
        {session.attempts.length === 0 ? (
          <p className="rounded-lg border border-border-subtle bg-raised/70 px-3 py-2 text-sm text-ink-muted">{copy.noAttempts}</p>
        ) : (
          <div className="space-y-2">
            {session.attempts.map((attempt) => {
              const state = attemptDisplayState(attempt);
              return (
                <div key={attempt.attempt_id} className="rounded-lg border border-border-subtle bg-raised/70 px-3 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] ${toneForAttempt(attempt)}`}>
                        {labels.attemptState[state]}
                      </span>
                      <span className="text-xs text-ink-subtle">
                        #{attempt.sequence} · {formatDate(attempt.created_at, locale)}
                      </span>
                    </div>
                    {attempt.review_id && (
                      <Link href={`/reviews/${attempt.review_id}?back=/account/reviews`} className="text-xs font-medium text-gold hover:text-gold-light">
                        {copy.review}
                      </Link>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-subtle">
                    {copy.task}: {labels.attemptState[attemptDisplayState(attempt)]} · {labels.sourceAccess[sourceAccessCopyKey(attempt.review_access)] ?? labels.sourceAccess.available}
                  </p>
                  {attempt.error?.message && (
                    <p className="mt-2 text-xs leading-5 text-rust">
                      {copy.error}: {attempt.error.message}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

export function LegacyRetakeList({
  items,
  copy,
  locale,
  loading,
  error,
  hasMore,
  loadingMore,
  onRetry,
  onLoadMore,
}: {
  items: ReviewHistoryItem[];
  copy: {
    title: string;
    body: string;
    empty: string;
    loading: string;
    retry: string;
    loadMore: string;
    loadingMore: string;
  };
  locale: string;
  loading: boolean;
  error: string;
  hasMore: boolean;
  loadingMore: boolean;
  onRetry: () => void;
  onLoadMore: () => void;
}) {
  return (
    <section className="mt-8 rounded-lg border border-border-subtle bg-raised/70 p-5">
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">{copy.title}</h2>
        <p className="mt-2 text-sm leading-6 text-ink-muted">{copy.body}</p>
      </div>
      {loading ? (
        <p className="text-sm text-ink-subtle">{copy.loading}</p>
      ) : error ? (
        <div className="flex items-center justify-between gap-3 rounded border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
          <span className="inline-flex items-center gap-2"><AlertCircle size={14} />{error}</span>
          <button type="button" onClick={onRetry} className="ui-action-secondary px-3 py-1.5 text-xs">
            {copy.retry}
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-ink-subtle">{copy.empty}</p>
      ) : (
        <>
          <div className="space-y-2">
            {items.map((item) => (
              <Link
                key={item.review_id}
                href={`/reviews/${item.review_id}?back=/account/reviews`}
                className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-void/30 px-3 py-3 transition-colors hover:border-gold/30"
              >
                <span className="min-w-0 text-sm text-ink">{item.comparison?.summary ?? item.review_id}</span>
                <span className="shrink-0 text-xs text-ink-subtle">{formatDate(item.created_at, locale)}</span>
              </Link>
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="ui-action-secondary mx-auto px-4 py-2 text-xs disabled:opacity-50"
              >
                {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                {loadingMore ? copy.loadingMore : copy.loadMore}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export function PracticeJournalLoading({ label }: { label: string }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-[108px] animate-pulse rounded-lg border border-border-subtle bg-raised/70" aria-label={label} />
      ))}
    </div>
  );
}

export function PracticeJournalEmpty({ copy }: { copy: { title: string; body: string } }) {
  return (
    <div className="ui-panel space-y-3 px-6 py-16 text-center">
      <Clock3 className="mx-auto text-ink-subtle" size={24} />
      <h2 className="font-display text-2xl text-ink">{copy.title}</h2>
      <p className="text-sm text-ink-subtle">{copy.body}</p>
    </div>
  );
}
