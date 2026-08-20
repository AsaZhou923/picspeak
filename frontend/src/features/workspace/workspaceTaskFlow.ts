import type { Stage } from './hooks/useUploadFlow';

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
