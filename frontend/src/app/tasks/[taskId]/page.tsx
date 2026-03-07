'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertCircle, RotateCcw, ArrowLeft, ShieldCheck, Cpu, CheckCircle2, Clock } from 'lucide-react';
import { getTask } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TaskStatusResponse, ApiException } from '@/lib/types';

// ─── Step definitions ──────────────────────────────────────────────────────────
// progress thresholds: 0=queued, 20=picked up, 40=auditing, 70=AI, 100=done

const STEPS = [
  {
    id: 'queue',
    label: '排队等待',
    detail: '任务已收到，等待处理…',
    icon: Clock,
    minProgress: 0,
    maxProgress: 19,
  },
  {
    id: 'audit',
    label: '内容审核',
    detail: '正在检查图片内容安全性…',
    icon: ShieldCheck,
    minProgress: 20,
    maxProgress: 69,
  },
  {
    id: 'ai',
    label: 'AI 深度分析',
    detail: 'AI 模型正在解析构图、光线、色彩、故事与技术…',
    icon: Cpu,
    minProgress: 70,
    maxProgress: 99,
  },
  {
    id: 'done',
    label: '点评完成',
    detail: '即将跳转到结果页…',
    icon: CheckCircle2,
    minProgress: 100,
    maxProgress: 100,
  },
];

function getActiveStep(progress: number, status: string) {
  if (status === 'SUCCEEDED') return STEPS.length - 1;
  return STEPS.findIndex((s) => progress >= s.minProgress && progress <= s.maxProgress) ?? 0;
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
  const pollCount = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = async () => {
    try {
      const token = await ensureToken();
      const data = await getTask(taskId, token);
      setTask(data);
      pollCount.current += 1;

      if (data.status === 'SUCCEEDED' && data.review_id) {
        setTimeout(() => router.push(`/reviews/${data.review_id}`), 800);
        return;
      }

      if (data.status === 'FAILED' || data.status === 'EXPIRED') {
        return; // stop polling
      }

      if (pollCount.current >= MAX_POLLS) {
        setError('等待时间过长，请稍后手动刷新或重新发起点评');
        return;
      }

      timerRef.current = setTimeout(poll, POLL_INTERVAL);
    } catch (err) {
      if (err instanceof ApiException) {
        setError(err.message);
      } else {
        setError('查询任务状态失败，请刷新页面');
      }
    }
  };

  useEffect(() => {
    poll();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  const stageInfo = task ? (task.status === 'FAILED' ? { label: '点评失败', detail: '任务处理时发生错误' } : task.status === 'EXPIRED' ? { label: '任务超时', detail: '任务等待时间过长已过期' } : null) : null;
  const isFinal = task?.status === 'FAILED' || task?.status === 'EXPIRED';
  const isSuccess = task?.status === 'SUCCEEDED';
  const activeStepIdx = task ? getActiveStep(task.progress, task.status) : 0;
  const activeStep = STEPS[activeStepIdx];

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-10 animate-fade-in">

        {/* Task ID */}
        <p className="text-xs text-ink-muted font-mono">任务 {taskId}</p>

        {/* Final error states */}
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
            {/* Step indicator */}
            <div className="relative">
              {/* Connector line */}
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
                          done || (active && isSuccess)
                            ? 'text-gold'
                            : active
                            ? 'text-ink'
                            : 'text-ink-subtle'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Active step description */}
            <div className="space-y-1">
              <h1 className="font-display text-3xl">
                {isSuccess ? '点评完成' : activeStep.label}
              </h1>
              <p className="text-sm text-ink-muted">
                {isSuccess ? '即将跳转到结果页…' : activeStep.detail}
              </p>
            </div>

            {/* Progress bar */}
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

        {/* Error messages */}
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

        {/* Actions */}
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
