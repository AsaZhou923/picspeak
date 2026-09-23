import type { Stage } from './hooks/useUploadFlow';
import type { ImageType, PracticeKind, RetakeDimensionKey, ReviewModel, TaskStatus } from '@/lib/types';

export type WorkspaceTaskStep = 'image' | 'settings' | 'submit';

export interface WorkspaceTaskFlowCopy {
  steps: Record<WorkspaceTaskStep, string>;
  stepHints: Record<WorkspaceTaskStep, string>;
  reviewModel: string;
  selectedValue: string;
  requestSummary: string;
  quotaImpact: (mode: 'flash' | 'pro') => string;
  quotaAvailable: (remaining: number | null, total: number | null) => string;
}

export interface PracticeGoalDraft {
  sourceReviewId: string;
  goal: string;
  successCriteria: string[];
  dimension?: RetakeDimensionKey | null;
  practiceKind: PracticeKind;
  locale: 'zh' | 'en' | 'ja';
}

export interface PendingPracticeState {
  semanticKey: string;
  reviewSemanticKey?: string;
  sessionId?: string;
  sessionIdempotencyKey: string;
  reviewIdempotencyKey?: string;
  photoId?: string;
  taskId?: string;
}

const PENDING_PRACTICE_KEY = 'ps_pending_practice_v1';
const TERMINAL_TASK_STATUSES = new Set<TaskStatus>(['FAILED', 'EXPIRED', 'DEAD_LETTER', 'SUCCEEDED']);

export interface PracticeReviewSemanticInput {
  sessionId: string;
  photoId: string;
  mode: 'flash' | 'pro';
  model: ReviewModel;
  imageType: ImageType;
  locale: 'zh' | 'en' | 'ja';
}

export interface PracticeAttemptIdempotencyState {
  task_id: string | null;
  review_id: string | null;
  task_status?: TaskStatus | null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function buildPracticeSuccessCriteria(goal: string): string[] {
  const normalized = normalizeText(goal);
  return normalized ? [normalized.slice(0, 300)] : [];
}

export function buildPracticeSemanticKey(draft: PracticeGoalDraft): string {
  return JSON.stringify({
    sourceReviewId: draft.sourceReviewId,
    goal: normalizeText(draft.goal).slice(0, 500),
    successCriteria: draft.successCriteria.map((value) => normalizeText(value).slice(0, 300)).filter(Boolean).slice(0, 5),
    dimension: draft.dimension ?? null,
    practiceKind: draft.practiceKind,
    locale: draft.locale,
  });
}

export function buildPracticeReviewSemanticKey(input: PracticeReviewSemanticInput): string {
  return JSON.stringify({
    sessionId: input.sessionId,
    photoId: input.photoId,
    mode: input.mode,
    model: input.model,
    imageType: input.imageType,
    locale: input.locale,
  });
}

export function shouldReusePracticeReviewIdempotencyKey(
  pending: PendingPracticeState | null,
  reviewSemanticKey: string,
  attempts: PracticeAttemptIdempotencyState[]
): boolean {
  if (!pending?.reviewIdempotencyKey || pending.reviewSemanticKey !== reviewSemanticKey) return false;
  if (!pending.taskId) return true;

  const matchingAttempt = attempts.find((attempt) => attempt.task_id === pending.taskId);
  if (!matchingAttempt) return true;
  if (matchingAttempt.review_id) return false;
  if (matchingAttempt.task_status && TERMINAL_TASK_STATUSES.has(matchingAttempt.task_status)) return false;
  return true;
}

export function makePracticeIdempotencyKey(prefix: string, semanticKey: string): string {
  void semanticKey;
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32) || 'practice';
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  return `${safePrefix}_${randomPart}`;
}

export function readPendingPracticeState(): PendingPracticeState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PENDING_PRACTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPracticeState;
    return parsed && typeof parsed.semanticKey === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writePendingPracticeState(state: PendingPracticeState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PENDING_PRACTICE_KEY, JSON.stringify(state));
  } catch {
    // best-effort recovery state
  }
}

export function clearPendingPracticeState(expectedSemanticKey?: string): void {
  if (typeof window === 'undefined') return;
  const current = readPendingPracticeState();
  if (expectedSemanticKey && current?.semanticKey !== expectedSemanticKey) return;
  try {
    window.localStorage.removeItem(PENDING_PRACTICE_KEY);
  } catch {
    // best-effort recovery state
  }
}

export function getWorkspaceTaskFlowCopy(locale: 'zh' | 'en' | 'ja'): WorkspaceTaskFlowCopy {
  if (locale === 'en') {
    return {
      steps: { image: 'Image', settings: 'Intent & settings', submit: 'Submit' },
      stepHints: {
        image: 'Choose the frame PicSpeak should critique.',
        settings: 'Set the photo context, model and critique depth.',
        submit: 'Review the request and start the critique.',
      },
      reviewModel: 'Critique model',
      selectedValue: 'Selected',
      requestSummary: 'Request summary',
      quotaImpact: (mode) => `This request counts against your ${mode === 'pro' ? 'Pro' : 'Flash'} critique quota.`,
      quotaAvailable: (remaining, total) =>
        remaining === null ? 'Quota is checked again when you submit.' : `${remaining}${total === null ? '' : ` / ${total}`} critiques available`,
    };
  }

  if (locale === 'ja') {
    return {
      steps: { image: '画像', settings: '目的と設定', submit: '送信' },
      stepHints: {
        image: '講評する写真を選びます。',
        settings: '写真の種類、モデル、講評の深さを設定します。',
        submit: '内容と利用枠を確認して講評を開始します。',
      },
      reviewModel: '講評モデル',
      selectedValue: '選択中',
      requestSummary: 'リクエスト内容',
      quotaImpact: (mode) => `送信すると ${mode === 'pro' ? 'Pro' : 'Flash'} 講評枠としてカウントされます。`,
      quotaAvailable: (remaining, total) =>
        remaining === null ? '送信時に利用枠を再確認します。' : `利用可能 ${remaining}${total === null ? '' : ` / ${total}`} 回`,
    };
  }

  return {
    steps: { image: '图片', settings: '意图与设置', submit: '提交' },
    stepHints: {
      image: '选择要让 PicSpeak 点评的照片。',
      settings: '设置图片语境、评图模型和点评深度。',
      submit: '确认请求内容和可用额度后开始点评。',
    },
    reviewModel: '评图模型',
    selectedValue: '当前选择',
    requestSummary: '请求摘要',
    quotaImpact: (mode) => `提交后将计入 ${mode === 'pro' ? 'Pro' : 'Flash'} 点评额度。`,
    quotaAvailable: (remaining, total) =>
      remaining === null ? '提交时会再次检查可用额度。' : `可用 ${remaining}${total === null ? '' : ` / ${total}`} 次`,
  };
}

export function resolveWorkspaceTaskStep(stage: Stage, hasReadyPhoto: boolean, hasSubmitError = false): WorkspaceTaskStep {
  if (stage === 'reviewing' || hasSubmitError) return 'submit';
  if (hasReadyPhoto && stage === 'ready') return 'settings';
  return 'image';
}

export function reviewModelLabel(model: 'qwen' | 'gpt-5.5' | 'gpt-5.6-luna'): string {
  if (model === 'gpt-5.5') return 'GPT-5.5';
  if (model === 'gpt-5.6-luna') return 'GPT-5.6';
  return 'Qwen 3.7';
}
