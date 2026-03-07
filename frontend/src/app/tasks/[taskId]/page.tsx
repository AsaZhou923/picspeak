'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertCircle, RotateCcw, ArrowLeft, ShieldCheck, Cpu, CheckCircle2, Clock } from 'lucide-react';
import { buildTaskWebSocketUrl, getTask } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, TaskStatusResponse, TaskStreamMessage } from '@/lib/types';

const STEPS = [
  { id: 'queue', label: '排队等待', detail: '任务已创建，等待 worker 领取。', icon: Clock, minProgress: 0, maxProgress: 19 },
  { id: 'audit', label: '内容审核', detail: '正在执行图片安全审核。', icon: ShieldCheck, minProgress: 20, maxProgress: 69 },
  { id: 'ai', label: 'AI 分析', detail: '模型正在分析构图、光线和技术表现。', icon: Cpu, minProgress: 70, maxProgress: 99 },
  { id: 'done', label: '点评完成', detail: '即将跳转到结果页。', icon: CheckCircle2, minProgress: 100, maxProgress: 100 },
];

function getActiveStep(progress: number, status: string) {
  if (status === 'SUCCEEDED') return STEPS.length - 1;
  return Math.max(STEPS.findIndex((step) => progress >= step.minProgress && progress <= step.maxProgress), 0);
}

const POLL_INTERVAL = 2000;
const MAX_POLLS = 60;

export default function TaskPage() {
  const router = useRouter();
  const params = useParams();
  const taskId = params.taskId as string;
  const { ensureToken } = useAuth();

  const [task, setTask] = useState<TaskStatusResponse | null>(null);
  const [error, setError] = useState('');
  const [eventMessage, setEventMessage] = useState('');
  const pollCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const wsConnectedRef = useRef(false);
  const finalRef = useRef(false);

  const handleTaskUpdate = (nextTask: TaskStatusResponse, nextEventMessage?: string) => {
    setTask(nextTask);
    if (nextEventMessage) setEventMessage(nextEventMessage);

    if (nextTask.status === 'SUCCEEDED' && nextTask.review_id) {
      finalRef.current = true;
      setTimeout(() => router.push(`/reviews/${nextTask.review_id}`), 800);
      return;
    }

    if (nextTask.status === 'FAILED' || nextTask.status === 'EXPIRED' || nextTask.status === 'DEAD_LETTER') {
      finalRef.current = true;
    }
  };

  const poll = async () => {
    if (wsConnectedRef.current || finalRef.current) return;

    try {
      const token = await ensureToken();
      const data = await getTask(taskId, token);
      pollCount.current += 1;
      handleTaskUpdate(data);

      if (finalRef.current) return;

      if (pollCount.current >= MAX_POLLS) {
        setError('等待时间过长，请稍后手动刷新或重新发起点评。');
        return;
      }

      timerRef.current = setTimeout(poll, POLL_INTERVAL);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('查询任务状态失败，请刷新页面重试。');
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const connect = async () => {
      try {
        const token = await ensureToken();
        if (cancelled) return;

        const ws = new WebSocket(buildTaskWebSocketUrl(taskId, token));
        wsRef.current = ws;

        ws.onopen = () => {
          wsConnectedRef.current = true;
          setError('');
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data) as TaskStreamMessage | { error?: { message?: string } };
          if ('task' in message) {
            handleTaskUpdate(message.task, message.event?.message ?? undefined);
            return;
          }
          if (message.error?.message) {
            setError(message.error.message);
          }
        };

        ws.onerror = () => {
          wsConnectedRef.current = false;
        };

        ws.onclose = () => {
          const isFinal = finalRef.current;
          wsConnectedRef.current = false;
          if (!cancelled && !isFinal) {
            poll();
          }
        };
      } catch {
        if (!cancelled) poll();
      }
    };

    poll();
    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const stageInfo = task
    ? task.status === 'FAILED'
      ? { label: '点评失败', detail: '任务处理过程中发生错误。' }
      : task.status === 'EXPIRED'
      ? { label: '任务超时', detail: '任务等待时间过长，系统已终止。' }
      : task.status === 'DEAD_LETTER'
      ? { label: '进入死信队列', detail: '任务已多次重试仍失败，请重新发起点评。' }
      : null
    : null;
  const isFinal = task?.status === 'FAILED' || task?.status === 'EXPIRED' || task?.status === 'DEAD_LETTER';
  const isSuccess = task?.status === 'SUCCEEDED';
  const activeStepIdx = task ? getActiveStep(task.progress, task.status) : 0;
  const activeStep = STEPS[activeStepIdx];

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-10 animate-fade-in">
        <p className="text-xs text-ink-muted font-mono">任务 {taskId}</p>

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
              <h1 className="font-display text-3xl">{isSuccess ? '点评完成' : activeStep.label}</h1>
              <p className="text-sm text-ink-muted">{isSuccess ? '即将跳转到结果页。' : activeStep.detail}</p>
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

        {eventMessage && !isFinal && <p className="text-xs text-ink-muted font-mono">{eventMessage}</p>}

        {error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {error}
          </p>
        )}
        {task?.error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {String((task.error as Record<string, unknown>).message ?? '未知错误')}
          </p>
        )}

        {(isFinal || error) && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => router.push('/workspace')}
              className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
            >
              <RotateCcw size={14} />
              重新发起点评
            </button>
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center gap-2 text-xs text-ink-muted hover:text-ink transition-colors"
            >
              <ArrowLeft size={11} />
              返回
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
