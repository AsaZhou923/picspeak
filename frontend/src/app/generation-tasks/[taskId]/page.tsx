'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, Cpu, Palette, Save, Sparkles } from 'lucide-react';
import { getGenerationTask, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, GenerationTaskStatusResponse } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';

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
  const statusTitle =
    task?.status === 'SUCCEEDED'
      ? t('generation_task_opening')
      : task?.status === 'PENDING'
        ? t('generation_task_queued')
        : t('generation_task_generating');
  const waitNote = GENERATION_WAIT_NOTES[Math.min(activeStep, GENERATION_WAIT_NOTES.length - 1)];
  const dimensionActiveIdx = Math.min(
    Math.max(Math.floor((progress / 100) * GENERATION_DIMENSIONS.length), 0),
    GENERATION_DIMENSIONS.length - 1
  );

  return (
    <div className="flex min-h-screen items-center justify-center px-6 pt-14">
      <div className="w-full max-w-lg space-y-9 text-center">
        <p className="font-mono text-xs text-ink-subtle">{t('generation_task_id_label')} {taskId}</p>
        <div className="relative">
          <div className="absolute left-10 right-10 top-5 h-px bg-border" />
          <div
            className="absolute left-10 top-5 h-px bg-gold transition-all duration-700"
            style={{ width: `calc((100% - 5rem) * ${activeStep / (steps.length - 1)})` }}
          />
          <div className="relative flex justify-between">
            {steps.map((step, index) => {
              const Icon = step.icon;
              const active = index <= activeStep;
              return (
                <div key={step.label} className="flex flex-col items-center gap-2">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full border ${active ? 'border-gold bg-gold/10 text-gold' : 'border-border bg-raised text-ink-subtle'}`}>
                    <Icon size={16} />
                  </div>
                  <span className="font-mono text-xs text-ink-muted">{step.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {failed ? (
          <div className="space-y-4">
            <AlertCircle size={44} className="mx-auto text-rust" />
            <h1 className="font-display text-3xl text-ink">{t('generation_task_failed_title')}</h1>
            <p className="text-sm leading-7 text-ink-muted">
              {task?.error?.message ?? t('generation_task_failed_body')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="font-display text-3xl text-ink">
              {statusTitle}
            </h1>
            <div className="h-1 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-gold transition-all duration-700" style={{ width: `${progress}%` }} />
            </div>
            <p className="font-mono text-xs text-ink-subtle">{progress}%</p>
          </div>
        )}

        {!failed && !error && (
          <section className="rounded-lg border border-border-subtle bg-surface/70 p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/80">{t('generation_wait_label')}</p>
                <h2 className="mt-1 text-sm font-medium text-ink">{t(waitNote.title)}</h2>
              </div>
              <Sparkles size={18} className="shrink-0 animate-pulse text-gold/80" />
            </div>
            <p className="text-xs leading-6 text-ink-muted">{t(waitNote.body)}</p>
            <div className="mt-4 grid grid-cols-4 gap-1.5">
              {GENERATION_DIMENSIONS.map((dimension, index) => (
                <div
                  key={dimension}
                  className={`rounded-md border px-2 py-2 text-center text-[10px] transition-all ${
                    index <= dimensionActiveIdx
                      ? 'border-gold/35 bg-gold/10 text-gold'
                      : 'border-border bg-raised/45 text-ink-subtle'
                  }`}
                >
                  {t(dimension)}
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-start gap-2 rounded-md border border-sage/20 bg-sage/5 px-3 py-2 text-xs leading-5 text-sage">
              <Palette size={13} className="mt-0.5 shrink-0" />
              <span>{t('generation_wait_prompt')}</span>
            </p>
          </section>
        )}

        {error && (
          <p className="rounded-lg border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">{error}</p>
        )}
      </div>
    </div>
  );
}
