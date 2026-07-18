'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, CheckCircle2, Clock, Cpu, Palette, Save, Sparkles } from 'lucide-react';
import { getGenerationTask, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, GenerationTaskStatusResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { WaitingBlogWindow } from '@/components/blog/WaitingBlogWindow';
import { useCreditPackCheckout } from '@/lib/hooks/useCreditPackCheckout';

const POLL_INTERVAL = 1200;
const GENERATION_WAIT_NOTES = [
  { title: 'generation_wait_note_queue_title', body: 'generation_wait_note_queue_body' },
  { title: 'generation_wait_note_prompt_title', body: 'generation_wait_note_prompt_body' },
  { title: 'generation_wait_note_render_title', body: 'generation_wait_note_render_body' },
  { title: 'generation_wait_note_finish_title', body: 'generation_wait_note_finish_body' },
] as const;
const GENERATION_DIMENSIONS = [
  'generation_wait_dimension_subject',
  'generation_wait_dimension_light',
  'generation_wait_dimension_palette',
  'generation_wait_dimension_detail',
] as const;

export default function GenerationTaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;
  const { ensureToken } = useAuth();
  const { t, locale } = useI18n();
  const [task, setTask] = useState<GenerationTaskStatusResponse | null>(null);
  const [error, setError] = useState('');
  const finalRef = useRef(false);
  const trackedFinalRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const activeTaskIdRef = useRef(taskId);

  useEffect(() => {
    let cancelled = false;
    if (activeTaskIdRef.current !== taskId) {
      activeTaskIdRef.current = taskId;
      finalRef.current = false;
      trackedFinalRef.current = false;
      setTask(null);
      setError('');
    }

    const poll = async () => {
      if (cancelled || finalRef.current) return;
      const controller = new AbortController();
      controllerRef.current?.abort();
      controllerRef.current = controller;
      try {
        const token = await ensureToken();
        const nextTask = await getGenerationTask(taskId, token, controller.signal);
        if (cancelled) return;
        setTask(nextTask);
        setError('');
        if (nextTask.status === 'SUCCEEDED' && nextTask.generation_id) {
          finalRef.current = true;
          if (!trackedFinalRef.current) {
            trackedFinalRef.current = true;
            void trackProductEvent('generation_succeeded', {
              token,
              pagePath: `/generation-tasks/${taskId}`,
              locale,
              metadata: {
                task_id: taskId,
                generation_id: nextTask.generation_id,
                generation_mode: nextTask.generation_mode,
                intent: nextTask.intent,
                source_review_id: nextTask.source_review_id,
              },
            });
          }
          const destination = `/generations/${nextTask.generation_id}`;
          router.replace(destination);
          window.setTimeout(() => {
            if (window.location.pathname !== destination) {
              window.location.assign(destination);
            }
          }, 1200);
          return;
        }
        if (nextTask.status === 'FAILED' || nextTask.status === 'EXPIRED' || nextTask.status === 'DEAD_LETTER') {
          finalRef.current = true;
          if (!trackedFinalRef.current) {
            trackedFinalRef.current = true;
            void trackProductEvent('generation_failed', {
              token,
              pagePath: `/generation-tasks/${taskId}`,
              locale,
              metadata: {
                task_id: taskId,
                error_code: nextTask.error?.code,
                generation_mode: nextTask.generation_mode,
                intent: nextTask.intent,
                source_review_id: nextTask.source_review_id,
              },
            });
            if (nextTask.error?.code === 'IMAGE_GENERATION_CREDITS_EXHAUSTED') {
              void trackProductEvent('generation_credit_exhausted', {
                token,
                pagePath: `/generation-tasks/${taskId}`,
                locale,
                metadata: {
                  task_id: taskId,
                  generation_mode: nextTask.generation_mode,
                  intent: nextTask.intent,
                  source_review_id: nextTask.source_review_id,
                  entrypoint: 'generation_task_failed',
                },
              });
            }
          }
          return;
        }
        if (!cancelled) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL);
        }
      } catch (err) {
        if (!cancelled && !isAbortError(err)) {
          setError(formatUserFacingError(t, err, err instanceof ApiException ? err.message : t('generation_task_fetch_error')));
          timerRef.current = setTimeout(poll, POLL_INTERVAL * 2);
        }
      }
    };

    poll();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      controllerRef.current?.abort();
    };
  }, [ensureToken, locale, router, t, taskId]);

  const progress = task?.progress ?? 0;
  const activeStep = task?.status === 'SUCCEEDED' ? 3 : progress >= 80 ? 2 : progress >= 40 ? 1 : 0;
  const steps = useMemo(
    () => [
      { label: t('generation_task_queue'), icon: Clock },
      { label: t('generation_task_generate'), icon: Cpu },
      { label: t('generation_task_save'), icon: Save },
      { label: t('generation_task_complete'), icon: CheckCircle2 },
    ],
    [t]
  );
  const failed = task?.status === 'FAILED' || task?.status === 'EXPIRED' || task?.status === 'DEAD_LETTER';
  const creditExhausted = failed && task?.error?.code === 'IMAGE_GENERATION_CREDITS_EXHAUSTED';
  const showWaitingBlog = !failed && !error;
  const waitingLayoutClass = showWaitingBlog
    ? 'lg:grid-cols-[minmax(0,1fr)_360px]'
    : 'max-w-task';
  const statusTitle =
    task?.status === 'SUCCEEDED'
      ? t('generation_task_opening')
      : !task || task.status === 'PENDING'
        ? t('generation_task_queued')
        : t('generation_task_generating');
  const waitNote = GENERATION_WAIT_NOTES[Math.min(activeStep, GENERATION_WAIT_NOTES.length - 1)];
  const dimensionActiveIdx = Math.min(
    Math.max(Math.floor((progress / 100) * GENERATION_DIMENSIONS.length), 0),
    GENERATION_DIMENSIONS.length - 1
  );
  const creditPackCheckout = useCreditPackCheckout({
    ensureToken,
    locale,
    t,
  });

  async function handleCreditPackCheckout() {
    await creditPackCheckout.startCreditPackCheckout({
      entrypoint: 'generation_task_credit_exhausted',
      pagePath: `/generation-tasks/${taskId}`,
      metadata: {
        task_id: taskId,
        generation_mode: task?.generation_mode,
        intent: task?.intent,
        source_review_id: task?.source_review_id,
      },
    });
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-workspace px-4 py-8 sm:px-6 sm:py-12">
        <div className={`mx-auto grid w-full items-start gap-6 ${waitingLayoutClass}`}>
          <div className="min-w-0 space-y-6">
            <section className="ui-feature-panel p-5 sm:p-8" aria-labelledby="generation-task-status">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="ui-eyebrow">{t('generation_wait_label')}</p>
                  <h1 id="generation-task-status" aria-live="polite" className="mt-2 text-3xl font-semibold tracking-tight text-ink">
                    {failed ? t('generation_task_failed_title') : statusTitle}
                  </h1>
                  <p className="mt-3 break-all font-mono text-xs text-ink-subtle">
                    {t('generation_task_id_label')} {taskId}
                  </p>
                </div>
                <span
                  className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 font-mono text-xs font-semibold ${
                    failed
                      ? 'border-rust/35 bg-rust/10 text-rust'
                      : 'border-gold/35 bg-gold/10 text-gold'
                  }`}
                >
                  {task?.status ?? 'PENDING'}
                </span>
              </div>

              <div className="mt-7">
                <div
                  role="progressbar"
                  aria-label={statusTitle}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="h-2 overflow-hidden rounded-full bg-border"
                >
                  <div className="h-full rounded-full bg-gold transition-all duration-700" style={{ width: `${progress}%` }} />
                </div>
                <p className="mt-2 text-right font-mono text-xs text-ink-subtle">{progress}%</p>
              </div>

              <div className="relative mt-7">
                <div className="absolute left-5 right-5 top-5 h-px bg-border" aria-hidden="true" />
                <div
                  className="absolute left-5 top-5 h-px bg-gold transition-all duration-700"
                  style={{ width: `calc((100% - 2.5rem) * ${activeStep / (steps.length - 1)})` }}
                  aria-hidden="true"
                />
                <ol className="relative grid grid-cols-4 gap-1">
                  {steps.map((step, index) => {
                    const Icon = step.icon;
                    const active = index <= activeStep;
                    return (
                      <li key={step.label} className="flex min-w-0 flex-col items-center gap-2 text-center" aria-current={index === activeStep ? 'step' : undefined}>
                        <span className={`flex h-10 w-10 items-center justify-center rounded-full border ${active ? 'border-gold bg-gold/10 text-gold' : 'border-border bg-raised text-ink-subtle'}`}>
                          <Icon size={16} aria-hidden="true" />
                        </span>
                        <span className="text-[10px] font-medium leading-4 text-ink-muted sm:text-xs">{step.label}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {failed && (
                <div role="alert" className="mt-7 border-t border-border-subtle pt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle size={22} className="mt-0.5 shrink-0 text-rust" aria-hidden="true" />
                    <p className="text-sm leading-7 text-ink-muted">
                      {task?.error?.message ?? t('generation_task_failed_body')}
                    </p>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {creditExhausted && (
                      <button
                        type="button"
                        onClick={() => void handleCreditPackCheckout()}
                        disabled={creditPackCheckout.busy}
                        className="ui-action-primary w-full px-4 text-sm disabled:opacity-60"
                      >
                        {t('usage_credit_pack_button')}
                      </button>
                    )}
                    <Link
                      href="/generate"
                      className={`ui-action-secondary w-full px-4 text-sm ${creditExhausted ? '' : 'sm:col-span-2'}`}
                    >
                      <ArrowLeft size={15} aria-hidden="true" />
                      {t('generation_detail_back_generate')}
                    </Link>
                  </div>
                  {creditExhausted && (
                    <p className="mt-3 text-xs leading-5 text-ink-subtle">{t('usage_credit_pack_payment_hint')}</p>
                  )}
                  {creditPackCheckout.message && (
                    <p aria-live="polite" className="mt-3 rounded-control border border-border-subtle bg-void/30 px-3 py-2 text-xs leading-5 text-ink-muted">
                      {creditPackCheckout.message}
                    </p>
                  )}
                </div>
              )}
            </section>

            {!failed && !error && (
              <section className="ui-panel p-5 text-left sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="ui-eyebrow text-[10px]">{t('generation_wait_label')}</p>
                    <h2 className="mt-1 text-base font-semibold text-ink">{t(waitNote.title)}</h2>
                  </div>
                  <Sparkles size={20} className="shrink-0 animate-pulse text-gold" aria-hidden="true" />
                </div>
                <p className="text-sm leading-7 text-ink-muted">{t(waitNote.body)}</p>
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {GENERATION_DIMENSIONS.map((dimension, index) => (
                    <div
                      key={dimension}
                      className={`rounded-control border px-2 py-2.5 text-center text-xs font-medium transition-all ${
                        index <= dimensionActiveIdx
                          ? 'border-gold/35 bg-gold/10 text-gold'
                          : 'border-border bg-raised/45 text-ink-subtle'
                      }`}
                    >
                      {t(dimension)}
                    </div>
                  ))}
                </div>
                <p className="mt-4 flex items-start gap-2 rounded-control border border-sage/25 bg-sage/10 px-3 py-3 text-xs leading-5 text-sage">
                  <Palette size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                  <span>{t('generation_wait_prompt')}</span>
                </p>
              </section>
            )}

            {error && (
              <p role="status" className="rounded-card border border-rust/30 bg-rust/10 px-4 py-3 text-sm text-rust">
                {error}
              </p>
            )}
          </div>

          {showWaitingBlog && (
            <aside className="mx-auto w-full max-w-md lg:max-w-none">
              <WaitingBlogWindow variant="generation" />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
