'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';
import { getTask } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TaskStatusResponse, ApiException } from '@/lib/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const STAGE_LABELS: Record<string, { label: string; detail: string }> = {
  PENDING: { label: '等待处理', detail: '任务已收到，正在排队中…' },
  RUNNING: { label: '分析中', detail: 'AI 正在深度解析你的照片…' },
  SUCCEEDED: { label: '点评完成', detail: '即将跳转到结果页…' },
  FAILED: { label: '点评失败', detail: '任务处理时发生错误' },
  EXPIRED: { label: '任务超时', detail: '任务等待时间过长已过期' },
};

const POLL_INTERVAL = 2000;
const MAX_POLLS = 60; // 2 min max

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

  const stageInfo = task ? STAGE_LABELS[task.status] : null;
  const isFinal = task?.status === 'FAILED' || task?.status === 'EXPIRED';
  const isSuccess = task?.status === 'SUCCEEDED';

  return (
    <div className="pt-14 min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center space-y-8 animate-fade-in">
        {/* Task ID */}
        <p className="text-xs text-ink-subtle font-mono">
          任务 {taskId}
        </p>

        {/* Status indicator */}
        {!isFinal && !isSuccess && (
          <div className="flex justify-center">
            <LoadingSpinner size={56} />
          </div>
        )}

        {isSuccess && (
          <div className="flex justify-center">
            <div className="w-14 h-14 rounded-full border border-sage/40 bg-sage/10 flex items-center justify-center">
              <span className="text-sage text-2xl font-display">✓</span>
            </div>
          </div>
        )}

        {isFinal && (
          <div className="flex justify-center">
            <AlertCircle size={48} className="text-rust" />
          </div>
        )}

        {/* Labels */}
        <div>
          <h1 className="font-display text-3xl mb-2">
            {stageInfo?.label ?? '查询中…'}
          </h1>
          <p className="text-sm text-ink-muted">
            {stageInfo?.detail ?? '正在获取任务状态…'}
          </p>
        </div>

        {/* Progress bar */}
        {task && !isFinal && (
          <div className="space-y-2">
            <div className="w-full h-0.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-gold rounded-full transition-all duration-700"
                style={{ width: `${task.progress}%` }}
              />
            </div>
            <p className="text-xs text-ink-subtle font-mono">{task.progress}%</p>
          </div>
        )}

        {/* Error message */}
        {error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {error}
          </p>
        )}

        {/* Task error detail */}
        {task?.error && (
          <p className="text-sm text-rust bg-rust/5 border border-rust/20 rounded px-4 py-2">
            {String(task.error.message ?? '未知错误')}
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
              className="flex items-center justify-center gap-2 text-xs text-ink-subtle hover:text-ink-muted transition-colors"
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
