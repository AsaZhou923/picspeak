'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { AlertCircle, RotateCcw, ArrowLeft, ShieldCheck, Cpu, CheckCircle2, Clock, Aperture } from 'lucide-react';
import { buildTaskWebSocketUrl, getTask, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { ApiException, TaskErrorPayload, TaskStatusResponse, TaskStreamMessage } from '@/lib/types';
import { formatSupportMessage, formatUserFacingError } from '@/lib/error-utils';

const POLL_INTERVAL = 1000;
const HEARTBEAT_STALE_MS = 3 * 60 * 1000;
const INITIAL_TASK_LOOKUP_GRACE_MS = 5000;
const WAIT_NOTES = [
  { title: 'task_wait_note_queue_title', body: 'task_wait_note_queue_body' },
  { title: 'task_wait_note_audit_title', body: 'task_wait_note_audit_body' },
  { title: 'task_wait_note_ai_title', body: 'task_wait_note_ai_body' },
  { title: 'task_wait_note_done_title', body: 'task_wait_note_done_body' },
] as const;
const REVIEW_DIMENSIONS = [
  'task_wait_dimension_composition',
  'task_wait_dimension_light',
  'task_wait_dimension_color',
  'task_wait_dimension_impact',
  'task_wait_dimension_technique',
] as const;

export default function TaskPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  const searchParams = useSearchParams();
  const urlMode = searchParams.get('mode');
  const { ensureToken } = useAuth();
  const { t } = useI18n();

  const STEPS = [
    { id: 'queue', label: t('task_step_queue_label'), detail: t('task_step_queue_detail'), icon: Clock, minProgress: 0, maxProgress: 19 },
    { id: 'audit', label: t('task_step_audit_label'), detail: t('task_step_audit_detail'), icon: ShieldCheck, minProgress: 20, maxProgress: 69 },
    { id: 'ai', label: t('task_step_ai_label'), detail: t('task_step_ai_detail'), icon: Cpu, minProgress: 70, maxProgress: 99 },
    { id: 'done', label: t('task_step_done_label'), detail: t('task_step_done_detail'), icon: CheckCircle2, minProgress: 100, maxProgress: 100 },
  ];

  const getActiveStep = (progress: number, status: string) => {
    if (status === 'SUCCEEDED') return STEPS.length - 1;
    return Math.max(STEPS.findIndex((step) => progress >= step.minProgress && progress <= step.maxProgress), 0);
  };

  const [task, setTask] = useState<TaskStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const pollCount = useRef(0);
  const pageStartedAtRef = useRef(Date.now());
  const transientErrorCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const finalRef = useRef(false);
  const errorTerminalRef = useRef(false);
  const taskRef = useRef<TaskStatusResponse | null>(null);
  const redirectReviewIdRef = useRef<string | null>(null);
  const pollRequestControllerRef = useRef<AbortController | null>(null);

  const setTransientError = (message: string) => {
    transientErrorCountRef.current += 1;
    const currentTask = taskRef.current;
    const hasActiveTask = currentTask && (currentTask.status === 'PENDING' || currentTask.status === 'RUNNING');
    if (!hasActiveTask || transientErrorCountRef.current >= 3) {
      setError(message);
    }
  };

  const handleTaskUpdate = (nextTask: TaskStatusResponse, nextEventMessage?: string) => {
    // Ignore stale updates once a terminal state has been reached (e.g. a concurrent HTTP
    // poll returning an old RUNNING snapshot after the WebSocket already delivered SUCCEEDED).
    if (finalRef.current) return;

    taskRef.current = nextTask;
    transientErrorCountRef.current = 0;
    setTask(nextTask);
    setError('');
    if (nextEventMessage) setEventMessage(nextEventMessage);

    if (nextTask.status === 'SUCCEEDED') {
      if (nextTask.review_id) {
        finalRef.current = true;
        if (redirectReviewIdRef.current !== nextTask.review_id) {
          redirectReviewIdRef.current = nextTask.review_id;
          if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
          redirectTimerRef.current = setTimeout(() => {
            router.push(`/reviews/${nextTask.review_id}`);
          }, 800);
        }
      }
      return;
    }

    if (nextTask.status === 'FAILED' || nextTask.status === 'EXPIRED' || nextTask.status === 'DEAD_LETTER') {
      finalRef.current = true;
    }
  };

  const shouldContinueWaiting = (nextTask: TaskStatusResponse) => {
    if (nextTask.status === 'PENDING' || nextTask.status === 'RUNNING') {
      if (nextTask.last_heartbeat_at) {
        const heartbeatAt = new Date(nextTask.last_heartbeat_at).getTime();
        if (!Number.isNaN(heartbeatAt) && Date.now() - heartbeatAt <= HEARTBEAT_STALE_MS) {
          return true;
        }
      }

      if (nextTask.next_attempt_at) {
        const retryAt = new Date(nextTask.next_attempt_at).getTime();
        if (!Number.isNaN(retryAt) && retryAt > Date.now()) {
          return true;
        }
      }
    }

    return false;
  };

  const poll = async () => {
    if (finalRef.current || errorTerminalRef.current) return;
    const controller = new AbortController();
    pollRequestControllerRef.current?.abort();
    pollRequestControllerRef.current = controller;

    try {
      const token = await ensureToken();
      if (controller.signal.aborted) return;
      const data = await getTask(taskId, token, controller.signal);
      pollCount.current += 1;
      setError('');
      handleTaskUpdate(data);

      if (finalRef.current) return;

      if (pollCount.current >= 60 && !shouldContinueWaiting(data)) {
        setError(t('task_timeout_error'));
        return;
      }
    } catch (err) {
      if (isAbortError(err)) {
        return;
      }
      if (err instanceof ApiException) {
        if (err.code === 'TASK_NOT_FOUND') {
          const withinGraceWindow = Date.now() - pageStartedAtRef.current < INITIAL_TASK_LOOKUP_GRACE_MS;
          const hasTaskSnapshot = taskRef.current !== null;
            if (!withinGraceWindow || hasTaskSnapshot) {
              errorTerminalRef.current = true;
              if (wsRef.current) wsRef.current.close();
              setError(formatUserFacingError(t, err, err.message));
              return;
            }
          }
        setTransientError(formatUserFacingError(t, err, err.message));
      } else {
        setTransientError(formatUserFacingError(t, err, t('task_fetch_error')));
      }
    } finally {
      if (pollRequestControllerRef.current === controller) {
        pollRequestControllerRef.current = null;
      }
      if (!finalRef.current && !errorTerminalRef.current && !wsConnectedRef.current) {
        timerRef.current = setTimeout(poll, POLL_INTERVAL);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const token = await ensureToken();
        if (cancelled) return;

        const ws = new WebSocket(buildTaskWebSocketUrl(taskId), ['picspeak-auth', token]);
        wsRef.current = ws;

        ws.onopen = () => {
          wsConnectedRef.current = true;
          transientErrorCountRef.current = 0;
          setError('');
          if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
          }
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as TaskStreamMessage | { error?: { message?: string } };
          if ('task' in message) {
            setError('');
            handleTaskUpdate(message.task, message.event?.message ?? undefined);
            return;
          }
          if (message.error?.message) {
            if (message.error.message === 'Task not found') {
              const withinGraceWindow = Date.now() - pageStartedAtRef.current < INITIAL_TASK_LOOKUP_GRACE_MS;
              const hasTaskSnapshot = taskRef.current !== null;
              if (!withinGraceWindow || hasTaskSnapshot) {
                errorTerminalRef.current = true;
                setError(formatUserFacingError(t, new ApiException(404, 'TASK_NOT_FOUND', message.error.message), message.error.message));
                return;
              }
            }
            setTransientError(formatUserFacingError(t, new ApiException(500, 'TASK_STREAM_ERROR', message.error.message), message.error.message));
          }
        };

        ws.onerror = () => {
          wsConnectedRef.current = false;
        };

        ws.onclose = () => {
          const isFinal = finalRef.current;
          wsConnectedRef.current = false;
          if (!cancelled && !isFinal && !errorTerminalRef.current) {
            // Cancel any pending timer-based poll to avoid concurrent poll chains, then
            // immediately kick off a fresh poll now that the WebSocket is gone.
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            poll();
          }
        };
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to connect task websocket', err);
          poll();
        }
      }
    };

    poll();
    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
      pollRequestControllerRef.current?.abort();
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, ensureToken, t]);

  const stageInfo = task
    ? task.status === 'FAILED'
      ? { label: t('task_failed_label'), detail: t('task_failed_detail') }
      : task.status === 'EXPIRED'
      ? { label: t('task_expired_label'), detail: t('task_expired_detail') }
      : task.status === 'DEAD_LETTER'
      ? { label: t('task_dead_letter_label'), detail: t('task_dead_letter_detail') }
      : null
    : null;
  const isFinal = task?.status === 'FAILED' || task?.status === 'EXPIRED' || task?.status === 'DEAD_LETTER';
  const isSuccess = task?.status === 'SUCCEEDED';
  const activeStepIdx = task ? getActiveStep(task.progress, task.status) : 0;
  const activeStep = STEPS[activeStepIdx];
  const waitNote = WAIT_NOTES[Math.min(activeStepIdx, WAIT_NOTES.length - 1)];
  const dimensionActiveIdx = Math.min(
    Math.max(Math.floor(((task?.progress ?? 0) / 100) * REVIEW_DIMENSIONS.length), 0),
    REVIEW_DIMENSIONS.length - 1
  );
  const taskError: TaskErrorPayload | null = task?.error ?? null;
  const taskErrorMessage = taskError ? formatSupportMessage(t, taskError.message ?? t('err_unknown_title')) : '';

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-10 animate-fade-in">
        <p className="text-xs text-ink-muted font-mono">{t('task_id_label')} {taskId}</p>

        {isFinal ? (
          <div className="space-y-4">
            <AlertCircle size={48} className="text-rust mx-auto" />
            <div>
              <h1 className="font-display text-3xl mb-2">{stageInfo?.label}</h1>
              <p className="text-sm text-ink-muted">{stageInfo?.detail}</p>
            </div>
          </div>
        ) : (
          <>
            <div className="relative">
              <div className="absolute top-5 left-[2.5rem] right-[2.5rem] h-px bg-border" />
              <div
                className="absolute top-5 left-[2.5rem] h-px bg-gold transition-all duration-700"
                style={{ width: `calc((100% - 5rem) * ${activeStepIdx / (STEPS.length - 1)})` }}
              />
              <div className="relative flex justify-between">
                {STEPS.map((step, idx) => {
                  const done = idx < activeStepIdx;
                  const active = idx === activeStepIdx;
                  const Icon = step.icon;
                  return (
                    <div key={step.id} className="flex flex-col items-center gap-2">
                      <div
                        className={`w-10 h-10 rounded-full border flex items-center justify-center transition-all duration-500 ${
                          done
                            ? 'bg-gold/20 border-gold text-gold'
                            : active && !isSuccess
                            ? 'bg-gold/10 border-gold/60 text-gold animate-pulse-slow'
                            : isSuccess && active
                            ? 'bg-sage/20 border-sage text-sage'
                            : 'bg-raised border-border text-ink-subtle'
                        }`}
                      >
                        <Icon size={16} />
                      </div>
                      <p
                        className={`text-xs font-mono whitespace-nowrap ${
                          done || (active && isSuccess) ? 'text-gold' : active ? 'text-ink' : 'text-ink-subtle'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1">
              <h1 className="font-display text-3xl">{isSuccess ? t('task_step_done_label') : activeStep.label}</h1>
              <p className="text-sm text-ink-muted">{isSuccess ? t('task_step_done_detail') : activeStep.detail}</p>
            </div>

            {task && !isSuccess && (
              <div className="space-y-2">
                <div className="w-full h-0.5 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gold rounded-full transition-all duration-700"
                    style={{ width: `${task.progress}%` }}
                  />
                </div>
                <p className="text-xs text-ink-muted font-mono">{task.progress}%</p>
              </div>
            )}
          </>
        )}

        {!isFinal && !error && (
          <section className="rounded-lg border border-border-subtle bg-surface/70 p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/80">{t('task_wait_label')}</p>
                <h2 className="mt-1 text-sm font-medium text-ink">{t(waitNote.title)}</h2>
              </div>
              <Aperture size={18} className="shrink-0 animate-spin-slow text-gold/80" />
            </div>
            <p className="text-xs leading-6 text-ink-muted">{t(waitNote.body)}</p>
            <div className="mt-4 grid grid-cols-5 gap-1.5">
              {REVIEW_DIMENSIONS.map((dimension, index) => (
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
            <p className="mt-4 rounded-md border border-sage/20 bg-sage/5 px-3 py-2 text-xs leading-5 text-sage">
              {t('task_wait_prompt')}
            </p>
          </section>
        )}

        {eventMessage && !isFinal && <p className="text-xs text-ink-muted font-mono">{eventMessage}</p>}

        {urlMode === 'pro' && activeStep?.id === 'ai' && !isFinal && !isSuccess && (
          <p className="text-xs text-ink-muted bg-raised border border-border rounded px-4 py-2">
            {t('task_pro_analysis_hint')}
          </p>
        )}

        {error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {error}
          </p>
        )}
        {task?.error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {taskErrorMessage}
          </p>
        )}

        {(isFinal || error) && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push('/workspace')}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
            >
              <RotateCcw size={14} />
              {t('task_retry')}
            </button>
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={11} />
              {t('task_back')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
