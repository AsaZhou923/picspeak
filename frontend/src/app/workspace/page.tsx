'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle } from 'lucide-react';
import Image from 'next/image';
import { createPracticeSession, createReview, getPracticeConfig, getPracticeSession, getReview, isAbortError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { ApiException, ImageType, PracticeKind, PracticeSessionResponse, ReviewCreateAsyncResponse, ReviewCreateSyncResponse, ReviewModel } from '@/lib/types';
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { trackProductEvent } from '@/lib/product-analytics';
import { resolveReviewAnalysisType } from '@/lib/retake-coach';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import { useWorkspaceUsage } from '@/features/workspace/hooks/useWorkspaceUsage';
import { useUploadFlow } from '@/features/workspace/hooks/useUploadFlow';
import { useReplayContext } from '@/features/workspace/hooks/useReplayContext';
import { QuotaModal } from '@/features/workspace/components/QuotaModal';
import { QuotaBanner } from '@/features/workspace/components/QuotaBanner';
import { RetakeWorkspaceIntro } from '@/features/workspace/components/RetakeWorkspaceIntro';
import { WorkspaceSettingsPanel } from '@/features/workspace/components/WorkspaceSettingsPanel';
import { WorkspaceSubmitPanel } from '@/features/workspace/components/WorkspaceSubmitPanel';
import { WorkspaceTaskShell } from '@/features/workspace/components/WorkspaceTaskShell';
import { usePracticeExposure } from '@/features/reviews/hooks/usePracticeExposure';
import { canContinuePractice } from '@/features/practice/journal';
import {
  buildPracticeSemanticKey,
  buildPracticeReviewSemanticKey,
  buildPracticeSuccessCriteria,
  clearPendingPracticeState,
  getWorkspaceTaskFlowCopy,
  makePracticeIdempotencyKey,
  readPendingPracticeState,
  resolveWorkspaceTaskStep,
  shouldReusePracticeReviewIdempotencyKey,
  writePendingPracticeState,
} from '@/features/workspace/workspaceTaskFlow';

function isImageType(value: string | null): value is ImageType {
  return ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'].includes(value as string);
}

function isPracticeKind(value: string | null): value is PracticeKind {
  return value === 'capture_retake' || value === 'edit_revision' || value === 'same_image_recheck';
}

function isRetakeDimension(value: string | null): value is NonNullable<PracticeSessionResponse['goal_snapshot']['dimension']> {
  return value === 'composition' || value === 'lighting' || value === 'color' || value === 'impact' || value === 'technical';
}

function retakeTargetCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: '再撮影の目標',
      title: '次の撮影目標を引き継ぎました',
      sourceReview: '元の講評',
      sourcePrompt: '元の作例',
      sourceContent: '元のコンテンツ',
      dimension: '重点項目',
      coachTitle: 'GPT-5.6 Retake Coach',
      originalLabel: '元の写真',
      retakeLabel: '再撮影',
      editedLabel: '編集後の写真',
      uploadHint: '新しい写真をアップロードすると、この目標と流入元の文脈を保ったまま講評できます。',
      editUploadHint: '編集後の写真をアップロードすると、元の写真との比較文脈を保ったまま修正を検証できます。',
      accept: 'この目標を保存',
      acceptBusy: '保存中…',
      acceptHint: '保存すると目標、成功条件、練習パスがサーバーに固定されます。',
      attemptHistory: '復元できる試行',
      attemptTask: 'タスクを開く',
      attemptReview: '結果を開く',
      attemptPending: '処理中',
      attemptFailed: '失敗',
      attemptDone: '完了',
      recheckHint: '同じ写真を再確認します。新しいアップロードは不要です。',
      disabled: '練習セッションは現在閉じています。通常の講評は利用できます。',
      frozen: '保存済みの練習目標',
      criteria: '成功条件',
      kind: '練習パス',
      kinds: {
        capture_retake: '撮り直し',
        edit_revision: '編集で検証',
        same_image_recheck: '同じ写真を再確認',
      },
    };
  }
  if (locale === 'en') {
    return {
      label: 'Retake Target',
      title: 'Next-shoot target carried over',
      sourceReview: 'Source review',
      sourcePrompt: 'Prompt example',
      sourceContent: 'Content source',
      dimension: 'Focus',
      coachTitle: 'GPT-5.6 Retake Coach',
      originalLabel: 'Original',
      retakeLabel: 'Retake',
      editedLabel: 'Edited photo',
      uploadHint: 'Upload a new photo and PicSpeak will keep this goal and source context attached to the critique.',
      editUploadHint: 'Upload the edited photo and PicSpeak will compare it with the original while keeping the saved goal attached.',
      accept: 'Save this goal',
      acceptBusy: 'Saving…',
      acceptHint: 'Saving freezes the goal, success checks, and practice path on the server.',
      attemptHistory: 'Recoverable attempts',
      attemptTask: 'Open task',
      attemptReview: 'Open result',
      attemptPending: 'Processing',
      attemptFailed: 'Failed',
      attemptDone: 'Completed',
      recheckHint: 'This rechecks the same source photo. No new upload is needed.',
      disabled: 'Practice sessions are closed right now. Standard critiques still work.',
      frozen: 'Saved practice goal',
      criteria: 'Success checks',
      kind: 'Practice path',
      kinds: {
        capture_retake: 'Capture retake',
        edit_revision: 'Edit revision',
        same_image_recheck: 'Same-image recheck',
      },
    };
  }
  return {
    label: '复拍目标',
    title: '已带入下一次拍摄目标',
    sourceReview: '来源点评',
    sourcePrompt: '来源案例',
    sourceContent: '内容来源',
    dimension: '重点维度',
    coachTitle: 'GPT-5.6 重拍教练',
    originalLabel: '原片',
    retakeLabel: '重拍图',
    editedLabel: '修改版照片',
    uploadHint: '上传新照片后，PicSpeak 会保留这次练习目标和来源上下文，方便继续复盘。',
    editUploadHint: '上传已经修改后的照片后，PicSpeak 会把它和原片放在同一个练习目标下对比。',
    accept: '保存这个目标',
    acceptBusy: '正在保存…',
    acceptHint: '保存后，目标、成功条件和练习路径会冻结到服务端。',
    attemptHistory: '可恢复的尝试',
    attemptTask: '打开任务',
    attemptReview: '打开结果',
    attemptPending: '处理中',
    attemptFailed: '失败',
    attemptDone: '已完成',
    recheckHint: '这会复查同一张来源照片，不需要重新上传。',
    disabled: '练习会话当前关闭，普通点评仍可使用。',
    frozen: '已保存的练习目标',
    criteria: '成功条件',
    kind: '练习路径',
    kinds: {
      capture_retake: '重新拍摄',
      edit_revision: '编辑修正',
      same_image_recheck: '同图复查',
    },
  };
}

function WorkspacePageContent() {
  const router = useRouter();
  const { token, ensureToken } = useAuth();
  const { t, locale } = useI18n();

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');
  const [reviewModel, setReviewModel] = useState<ReviewModel>('qwen');
  const [imageType, setImageType] = useState<ImageType>('default');
  const [showQuotaModal, setShowQuotaModal] = useState(false);
  const [practiceEnabled, setPracticeEnabled] = useState(false);
  const [practiceSession, setPracticeSession] = useState<PracticeSessionResponse | null>(null);
  const [practiceError, setPracticeError] = useState('');
  const [practiceKind, setPracticeKind] = useState<PracticeKind>('capture_retake');
  const [practiceAccepting, setPracticeAccepting] = useState(false);
  const [sessionSourcePhotoUrl, setSessionSourcePhotoUrl] = useState<string | null>(null);
  const [sessionSourceLoading, setSessionSourceLoading] = useState(false);
  const [sessionSourceError, setSessionSourceError] = useState(false);

  const { usage, usageError, fetchUsage, currentPlan, isGuest, remainingQuota, totalQuota } =
    useWorkspaceUsage(reviewMode);

  const {
    selectedFile,
    preview,
    uploadProgress,
    stage,
    setStage,
    photo,
    errMessage,
    setErrMessage,
    handleFileSelected: _handleFileSelected,
    handleReset,
  } = useUploadFlow({ fetchUsage });

  const {
    sourceReviewId,
    replayPhotoId,
    replayPhotoUrl,
    sourcePhotoError,
    sourcePhotoLoading,
    clearReplay,
    initialMode,
    initialImageType,
    retakeIntent,
    nextShootAction,
    nextShootDimension,
    sourceGenerationId,
    contentEntrypoint,
    contentSlug,
    galleryReviewId,
    promptExampleId,
    practiceSessionId,
    initialPracticeKind,
  } =
    useReplayContext();

  const handleFileSelected = useCallback(
    async (...args: Parameters<typeof _handleFileSelected>) => {
      clearReplay({ preserveSourcePhoto: true });
      return _handleFileSelected(...args);
    },
    [clearReplay, _handleFileSelected]
  );

  const unresolvedPracticeSession = Boolean(practiceSessionId && practiceSession?.session_id !== practiceSessionId);
  const trustedSourceReviewId = unresolvedPracticeSession ? null : practiceSession ? practiceSession.source_review_id : sourceReviewId;
  const trustedSourcePhotoId = unresolvedPracticeSession ? null : practiceSession ? practiceSession.source_photo_id : replayPhotoId;
  const trustedPracticeKind = practiceSession?.practice_kind ?? practiceKind;
  const trustedLocale = practiceSession?.locale ?? locale;
  const trustedSourcePhotoUrl = practiceSession ? sessionSourcePhotoUrl : replayPhotoUrl;
  const trustedSourceLoading = practiceSession ? sessionSourceLoading : sourcePhotoLoading;
  const trustedSourceError = practiceSession ? sessionSourceError : sourcePhotoError;
  const canUseNextShootTarget = !unresolvedPracticeSession && Boolean(practiceSession || (practiceEnabled && nextShootAction));
  const targetCopy = retakeTargetCopy(locale);
  const coachCopy = getRetakeCoachCopy(locale);
  const activePracticeDimension = practiceSession?.goal_snapshot.dimension
    ?? (isRetakeDimension(nextShootDimension) ? nextShootDimension : null);
  const activePracticeDimensionLabel = activePracticeDimension ? coachCopy.dimensions[activePracticeDimension] : null;
  const isRetakeCoachFlow = retakeIntent === 'retake_coach' && Boolean(trustedSourceReviewId);
  const isPracticePairedFlow = Boolean((practiceSession || (practiceEnabled && nextShootAction)) && trustedPracticeKind !== 'same_image_recheck');
  const selectedReviewModel: ReviewModel = isRetakeCoachFlow || isPracticePairedFlow ? 'gpt-5.6-luna' : reviewModel;
  const contentSourceLabel = promptExampleId ?? contentSlug ?? galleryReviewId;
  const practiceGoalDraft = useMemo(() => {
    if (!sourceReviewId || !nextShootAction || practiceSession || practiceSessionId) return null;
    const criteria = buildPracticeSuccessCriteria(nextShootAction);
    if (criteria.length === 0) return null;
    return {
      sourceReviewId,
      goal: nextShootAction,
      successCriteria: criteria,
      dimension: isRetakeDimension(nextShootDimension) ? nextShootDimension : 'composition',
      practiceKind,
      locale,
    };
  }, [locale, nextShootAction, nextShootDimension, practiceKind, practiceSession, practiceSessionId, sourceReviewId]);
  const activePracticeKind = trustedPracticeKind;
  const goalExposureRef = usePracticeExposure(
    'practice_goal_shown', practiceGoalDraft?.sourceReviewId, locale,
    Boolean(practiceEnabled && practiceGoalDraft),
  );
  const savedPracticeSourceUnavailable = Boolean(
    practiceSession &&
    (practiceSession.source_access !== 'available' || !practiceSession.source_review_id || !practiceSession.source_photo_id)
  );
  const hasPracticeDraft = Boolean(practiceEnabled && practiceGoalDraft);
  const savedPracticeClosed = unresolvedPracticeSession || Boolean(practiceSession && (!practiceEnabled || savedPracticeSourceUnavailable || !canContinuePractice(practiceSession)));
  const canUploadRetake =
    !hasPracticeDraft && !savedPracticeClosed && (!isRetakeCoachFlow || Boolean(trustedSourcePhotoUrl)) && (!practiceSession || trustedPracticeKind !== 'same_image_recheck');
  const canSubmitSameImageRecheck = Boolean(
    practiceSession && !savedPracticeClosed && trustedPracticeKind === 'same_image_recheck' && trustedSourcePhotoId
  );

  useEffect(() => {
    if (isGuest && reviewMode === 'pro') setReviewMode('flash');
  }, [isGuest, reviewMode]);

  useEffect(() => {
    if (initialMode === 'flash' || initialMode === 'pro') setReviewMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (isImageType(initialImageType)) setImageType(initialImageType);
  }, [initialImageType]);

  useEffect(() => {
    if (!isPracticeKind(initialPracticeKind)) return;
    if (!practiceSessionId && initialPracticeKind === 'same_image_recheck') {
      setPracticeKind('edit_revision');
      return;
    }
    setPracticeKind(initialPracticeKind);
  }, [initialPracticeKind, practiceSessionId]);

  useEffect(() => {
    const controller = new AbortController();
    getPracticeConfig(undefined, controller.signal)
      .then((config) => {
        if (!controller.signal.aborted) setPracticeEnabled(config.practice_enabled);
      })
      .catch(() => {
        if (!controller.signal.aborted) setPracticeEnabled(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!practiceSessionId) return;
    const controller = new AbortController();
    setPracticeSession(null);
    setPracticeError('');
    ensureToken()
      .then((tok) => getPracticeSession(practiceSessionId, tok, controller.signal))
      .then((session) => {
        if (controller.signal.aborted) return;
        setPracticeSession(session);
        setPracticeKind(session.practice_kind);
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          setPracticeError(formatUserFacingError(t, err, t('review_err_fetch')));
        }
      });
    return () => controller.abort();
  }, [ensureToken, practiceSessionId, t]);

  useEffect(() => {
    const sessionSourceReviewId = practiceSession?.source_review_id;
    if (!sessionSourceReviewId || practiceSession.source_access !== 'available') {
      setSessionSourcePhotoUrl(null);
      setSessionSourceError(Boolean(practiceSession));
      setSessionSourceLoading(false);
      return;
    }
    const controller = new AbortController();
    setSessionSourceLoading(true);
    setSessionSourceError(false);
    ensureToken()
      .then((tok) => getReview(sessionSourceReviewId, tok, controller.signal))
      .then((sourceReview) => {
        if (controller.signal.aborted) return;
        setSessionSourcePhotoUrl(sourceReview.photo_url);
        setSessionSourceError(!sourceReview.photo_url);
      })
      .catch((err) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setSessionSourcePhotoUrl(null);
          setSessionSourceError(true);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setSessionSourceLoading(false);
      });
    return () => controller.abort();
  }, [ensureToken, practiceSession, practiceSession?.source_review_id, practiceSession?.source_access]);

  const ensurePracticeSession = useCallback(async (tok: string): Promise<PracticeSessionResponse | null> => {
    if (practiceSession) return practiceSession;
    if (!practiceGoalDraft) return null;
    if (!practiceEnabled) {
      throw new ApiException(409, 'PRACTICE_DISABLED', targetCopy.disabled);
    }

    const semanticKey = buildPracticeSemanticKey(practiceGoalDraft);
    const pending = readPendingPracticeState();
    const sessionIdempotencyKey =
      pending?.semanticKey === semanticKey
        ? pending.sessionIdempotencyKey
        : makePracticeIdempotencyKey('practice_session', semanticKey);
    writePendingPracticeState({ semanticKey, sessionIdempotencyKey });
    const session = await createPracticeSession(
      {
        source_review_id: practiceGoalDraft.sourceReviewId,
        practice_kind: practiceGoalDraft.practiceKind,
        goal_snapshot: {
          goal_version: 'goal-assessment-v1',
          goal: practiceGoalDraft.goal.slice(0, 500),
          dimension: practiceGoalDraft.dimension ?? 'composition',
        },
        success_criteria: practiceGoalDraft.successCriteria.slice(0, 5).map((criterion, index) => ({
          key: `criterion_${index + 1}`,
          label: criterion.slice(0, 300),
        })),
        locale: practiceGoalDraft.locale,
        idempotency_key: sessionIdempotencyKey,
      },
      tok
    );
    setPracticeSession(session);
    setPracticeKind(session.practice_kind);
    writePendingPracticeState({ semanticKey, sessionId: session.session_id, sessionIdempotencyKey });
    return session;
  }, [practiceEnabled, practiceGoalDraft, practiceSession, targetCopy.disabled]);

  const handleAcceptPracticeGoal = useCallback(async () => {
    if (!practiceGoalDraft || practiceAccepting) return;
    setPracticeAccepting(true);
    setPracticeError('');
    try {
      const tok = await ensureToken();
      const session = await ensurePracticeSession(tok);
      if (session) {
        const params = new URLSearchParams({ practice_session_id: session.session_id });
        router.replace(`/workspace?${params.toString()}`);
      }
    } catch (err) {
      setPracticeError(formatUserFacingError(t, err, targetCopy.disabled));
    } finally {
      setPracticeAccepting(false);
    }
  }, [ensurePracticeSession, ensureToken, practiceAccepting, practiceGoalDraft, router, t, targetCopy.disabled]);

  const handleReview = useCallback(async () => {
    const draftPhotoId = photo?.photo_id;
    if (!draftPhotoId && !canSubmitSameImageRecheck) return;
    void trackProductEvent('start_review_clicked', {
      token: token ?? undefined,
      pagePath: '/workspace',
      locale,
      metadata: {
        review_mode: reviewMode,
        review_model: selectedReviewModel,
        image_type: imageType,
        has_source_review_id: Boolean(trustedSourceReviewId),
        retake_intent: retakeIntent,
        next_shoot_action: nextShootAction,
        next_shoot_dimension: nextShootDimension,
        source_generation_id: sourceGenerationId,
        content_entrypoint: contentEntrypoint,
        content_slug: contentSlug,
        gallery_review_id: galleryReviewId,
        prompt_example_id: promptExampleId,
      },
    });
    if (usage && remainingQuota !== null && remainingQuota <= 0) {
      setShowQuotaModal(true);
      return;
    }
    setStage('reviewing');
    setErrMessage('');
    try {
      const tok = await ensureToken();
      const session = practiceSession;
      const requestSourceReviewId = session ? session.source_review_id : sourceReviewId;
      if (unresolvedPracticeSession) {
        throw new ApiException(409, 'PRACTICE_SESSION_NOT_READY', t('practice_loading'));
      }
      if (session && !practiceEnabled) {
        throw new ApiException(403, 'PRACTICE_DISABLED', targetCopy.disabled);
      }
      if (session && savedPracticeSourceUnavailable) {
        throw new ApiException(403, 'PRACTICE_SOURCE_NOT_READY', targetCopy.disabled);
      }
      if (session && !canContinuePractice(session)) {
        throw new ApiException(409, 'PRACTICE_SESSION_INACTIVE', targetCopy.disabled);
      }
      const activePhotoId = session?.practice_kind === 'same_image_recheck'
        ? session.source_photo_id
        : photo?.photo_id;
      if (!activePhotoId) {
        throw new ApiException(400, 'PRACTICE_PHOTO_MISSING', targetCopy.disabled);
      }
      const practiceSemanticKey = session
        ? buildPracticeSemanticKey({
            sourceReviewId: session.source_review_id ?? '',
            goal: session.goal_snapshot.goal,
            successCriteria: session.success_criteria.map((criterion) => criterion.label),
            dimension: session.goal_snapshot.dimension,
            practiceKind: session.practice_kind,
            locale: session.locale,
          })
        : null;
      const pending = practiceSemanticKey ? readPendingPracticeState() : null;
      const matchingPending = pending?.semanticKey === practiceSemanticKey ? pending : null;
      const reviewSemanticKey = session
        ? buildPracticeReviewSemanticKey({
            sessionId: session.session_id,
            photoId: activePhotoId,
            mode: reviewMode,
            model: selectedReviewModel,
            imageType,
            locale: trustedLocale,
          })
        : null;
      const canReusePendingKey = Boolean(
        reviewSemanticKey &&
        shouldReusePracticeReviewIdempotencyKey(matchingPending, reviewSemanticKey, session?.attempts ?? [])
      );
      const idempotencyKey =
        canReusePendingKey && matchingPending?.reviewIdempotencyKey
          ? matchingPending.reviewIdempotencyKey
          : session
            ? makePracticeIdempotencyKey(
                'practice_review',
                `${practiceSemanticKey}:${session.session_id}:${activePhotoId}:${reviewMode}:${selectedReviewModel}:${imageType}:${session.attempts.length + 1}:${Date.now()}`
              )
            : `${activePhotoId}-${reviewMode}-${selectedReviewModel}-${Date.now()}`;
      if (practiceSemanticKey && session) {
        writePendingPracticeState({
          semanticKey: practiceSemanticKey,
          reviewSemanticKey: reviewSemanticKey ?? undefined,
          sessionId: session.session_id,
          sessionIdempotencyKey: matchingPending?.sessionIdempotencyKey ?? makePracticeIdempotencyKey('practice_session', practiceSemanticKey),
          reviewIdempotencyKey: idempotencyKey,
          photoId: activePhotoId,
        });
      }
      const result = await createReview(
        {
          photo_id: activePhotoId,
          mode: reviewMode,
          review_model: selectedReviewModel,
          async: true,
          idempotency_key: idempotencyKey,
          locale: trustedLocale,
          image_type: imageType,
          ...(requestSourceReviewId ? { source_review_id: requestSourceReviewId } : {}),
          ...(session ? { practice_session_id: session.session_id, practice_kind: session.practice_kind } : {}),
          analysis_type: session?.practice_kind === 'same_image_recheck'
            ? 'single'
            : resolveReviewAnalysisType(requestSourceReviewId, Boolean(photo)),
        },
        tok
      );
      if ('task_id' in result) {
        const asyncResult = result as ReviewCreateAsyncResponse;
        if (practiceSemanticKey && session) {
          writePendingPracticeState({
            semanticKey: practiceSemanticKey,
            reviewSemanticKey: reviewSemanticKey ?? undefined,
            sessionId: session.session_id,
            sessionIdempotencyKey: matchingPending?.sessionIdempotencyKey ?? makePracticeIdempotencyKey('practice_session', practiceSemanticKey),
            reviewIdempotencyKey: idempotencyKey,
            photoId: activePhotoId,
            taskId: asyncResult.task_id,
          });
        }
        void trackProductEvent('review_requested', {
          token: tok ?? undefined,
          pagePath: '/workspace',
          locale,
          metadata: {
            review_mode: reviewMode,
            review_model: selectedReviewModel,
            image_type: imageType,
            photo_id: activePhotoId,
            task_id: asyncResult.task_id,
            async: true,
            has_source_review_id: Boolean(requestSourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
            content_entrypoint: contentEntrypoint,
            content_slug: contentSlug,
            gallery_review_id: galleryReviewId,
            prompt_example_id: promptExampleId,
            practice_session_id: session?.session_id,
            practice_kind: session?.practice_kind,
          },
        });
        const taskParams = new URLSearchParams({ mode: reviewMode });
        if (session) taskParams.set('practice_session_id', session.session_id);
        router.push(`/tasks/${asyncResult.task_id}?${taskParams.toString()}`);
      } else {
        const syncResult = result as ReviewCreateSyncResponse;
        if (practiceSemanticKey) clearPendingPracticeState(practiceSemanticKey);
        void trackProductEvent('review_requested', {
          token: tok ?? undefined,
          pagePath: '/workspace',
          locale,
          metadata: {
            review_mode: reviewMode,
            review_model: selectedReviewModel,
            image_type: imageType,
            photo_id: activePhotoId,
            review_id: syncResult.review_id,
            async: false,
            has_source_review_id: Boolean(requestSourceReviewId),
            retake_intent: retakeIntent,
            next_shoot_action: nextShootAction,
            next_shoot_dimension: nextShootDimension,
            source_generation_id: sourceGenerationId,
            content_entrypoint: contentEntrypoint,
            content_slug: contentSlug,
            gallery_review_id: galleryReviewId,
            prompt_example_id: promptExampleId,
            practice_session_id: session?.session_id,
            practice_kind: session?.practice_kind,
          },
        });
        router.push(`/reviews/${syncResult.review_id}`);
      }
    } catch (err) {
      setStage('ready');
      if (err instanceof ApiException) {
        if (err.status === 429) {
          setErrMessage(formatUserFacingError(t, err, t('err_rate_limit')));
        } else if (err.code === 'QUOTA_EXCEEDED') {
          setErrMessage(formatUserFacingError(t, err, t('err_quota')));
        } else {
          setErrMessage(formatUserFacingError(t, err, t('task_failed_detail')));
        }
      } else {
        setErrMessage(formatUserFacingError(t, err, t('err_upload')));
      }
    }
  }, [photo, practiceSession, unresolvedPracticeSession, canSubmitSameImageRecheck, reviewMode, selectedReviewModel, locale, trustedLocale, imageType, trustedSourceReviewId, sourceReviewId, retakeIntent, nextShootAction, nextShootDimension, sourceGenerationId, contentEntrypoint, contentSlug, galleryReviewId, promptExampleId, ensureToken, router, t, token, usage, remainingQuota, practiceEnabled, savedPracticeSourceUnavailable, setStage, setErrMessage, targetCopy.disabled]);

  const flowCopy = getWorkspaceTaskFlowCopy(locale);
  const hasReadyPhoto = Boolean(photo && (stage === 'ready' || stage === 'reviewing'));
  const hasSubmitError = Boolean(stage === 'ready' && errMessage);
  const activeTaskStep = resolveWorkspaceTaskStep(stage, hasReadyPhoto, hasSubmitError);
  const uploadedPracticePhotoLabel = trustedPracticeKind === 'edit_revision' ? targetCopy.editedLabel : targetCopy.retakeLabel;
  const practiceUploadHint = trustedPracticeKind === 'edit_revision' ? targetCopy.editUploadHint : targetCopy.uploadHint;
  const completedTaskSteps =
    activeTaskStep === 'submit'
      ? (['image', 'settings'] as const)
      : hasReadyPhoto
        ? (['image'] as const)
        : [];
  const practiceGoalPanel = canUseNextShootTarget ? (
    <section ref={goalExposureRef} className="ui-panel max-w-task p-5 animate-fade-in sm:p-6">
      <p className="ui-eyebrow mb-2">{practiceSession ? targetCopy.frozen : targetCopy.label}</p>
      <h2 className="font-display text-2xl text-ink sm:text-3xl">
        {practiceSession ? practiceSession.goal_snapshot.goal : targetCopy.title}
      </h2>
      {!practiceSession && nextShootAction && (
        <p className="mt-3 text-sm leading-7 text-ink">{nextShootAction}</p>
      )}
      {practiceSession?.success_criteria.length ? (
        <div className="mt-4 rounded-control border border-gold/20 bg-gold/5 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gold">{targetCopy.criteria}</p>
          <ul className="mt-2 space-y-1.5 text-sm leading-6 text-ink-muted">
            {practiceSession.success_criteria.slice(0, 5).map((criterion, index) => (
              <li key={`${criterion.key}-${index}`}>• {criterion.label.slice(0, 300)}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {!practiceSession && nextShootAction && (
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">
            {targetCopy.kind}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['capture_retake', 'edit_revision'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  clearPendingPracticeState();
                  setPracticeKind(kind);
                }}
                disabled={!practiceEnabled || practiceAccepting}
                className={`min-h-11 rounded-control border px-3 py-2 text-left text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                  practiceKind === kind
                    ? 'border-gold/45 bg-gold/10 text-gold'
                    : 'border-border-subtle bg-raised/50 text-ink-muted hover:border-gold/25 hover:text-ink'
                }`}
              >
                {targetCopy.kinds[kind]}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-ink-muted">{targetCopy.acceptHint}</p>
          <button
            type="button"
            onClick={() => void handleAcceptPracticeGoal()}
            disabled={!practiceEnabled || practiceAccepting}
            className="mt-4 inline-flex min-h-11 items-center rounded-control bg-action px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {practiceAccepting ? targetCopy.acceptBusy : targetCopy.accept}
          </button>
        </fieldset>
      )}
      <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-ink-subtle">
        {activePracticeDimensionLabel && (
          <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
            {targetCopy.dimension}: {activePracticeDimensionLabel}
          </span>
        )}
        {trustedSourceReviewId && (!practiceSession || practiceSession.source_access === 'available') && (
          <Link
            href={`/reviews/${trustedSourceReviewId}`}
            className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1 text-ink-subtle transition-colors hover:border-gold/30 hover:text-gold"
          >
            {targetCopy.sourceReview}
          </Link>
        )}
        {practiceSession && (
          <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
            {targetCopy.kind}: {targetCopy.kinds[activePracticeKind]}
          </span>
        )}
        {promptExampleId && (
          <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
            {targetCopy.sourcePrompt}: {promptExampleId}
          </span>
        )}
        {!promptExampleId && contentSourceLabel && (
          <span className="rounded-control border border-border-subtle bg-raised/60 px-3 py-1">
            {targetCopy.sourceContent}: {contentSourceLabel}
          </span>
        )}
      </div>
      {practiceSession?.attempts.length ? (
        <div className="mt-5 rounded-control border border-border-subtle bg-raised/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-subtle">{targetCopy.attemptHistory}</p>
          <ul className="mt-3 space-y-2">
            {practiceSession.attempts.map((attempt) => {
              const statusLabel = attempt.review_id
                ? targetCopy.attemptDone
                : attempt.task_status === 'FAILED' || attempt.error
                  ? targetCopy.attemptFailed
                  : targetCopy.attemptPending;
              return (
                <li key={attempt.attempt_id} className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border-subtle bg-surface/60 px-3 py-2 text-xs text-ink-muted">
                  <span>#{attempt.sequence} · {targetCopy.kinds[attempt.kind]} · {statusLabel}</span>
                  <span className="flex flex-wrap gap-2">
                    {attempt.task_id && (
                      <Link className="font-semibold text-gold hover:text-action" href={`/tasks/${attempt.task_id}?mode=${reviewMode}&practice_session_id=${practiceSession.session_id}`}>
                        {targetCopy.attemptTask}
                      </Link>
                    )}
                    {attempt.review_id && attempt.review_access !== 'hidden' && attempt.review_access !== 'deleted' && attempt.review_access !== 'expired' && (
                      <Link className="font-semibold text-gold hover:text-action" href={`/reviews/${attempt.review_id}`}>
                        {targetCopy.attemptReview}
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {!practiceEnabled && !practiceSession && (
        <p className="mt-4 rounded-control border border-rust/25 bg-rust/10 px-3 py-2 text-xs leading-5 text-rust">
          {targetCopy.disabled}
        </p>
      )}
      {practiceError && (
        <p className="mt-4 rounded-control border border-rust/25 bg-rust/10 px-3 py-2 text-xs leading-5 text-rust">
          {practiceError}
        </p>
      )}
      {practiceSession && savedPracticeClosed && !practiceError && (
        <p role="status" className="mt-4 rounded-control border border-rust/25 bg-rust/10 px-3 py-2 text-xs leading-5 text-rust">
          {t('err_practice_unavailable_body')}
        </p>
      )}
      {practiceSession?.practice_kind === 'same_image_recheck' && (
        <div className="mt-4 rounded-control border border-sage/25 bg-sage/10 px-4 py-3">
          <p className="text-sm leading-6 text-ink-muted">{targetCopy.recheckHint}</p>
          <button
            type="button"
            onClick={handleReview}
            disabled={stage === 'reviewing' || !trustedSourcePhotoId || savedPracticeClosed}
            className="mt-3 inline-flex min-h-11 items-center rounded-control bg-action px-4 py-2 text-sm font-semibold text-void transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {stage === 'reviewing' ? t('status_running') : t('review_btn_again')}
          </button>
        </div>
      )}
      {practiceSession?.practice_kind !== 'same_image_recheck' && (
        <p className="mt-4 text-xs leading-5 text-ink-muted">{practiceUploadHint}</p>
      )}
    </section>
  ) : null;

  return (
    <div className="min-h-screen">
      {showQuotaModal && (
        <QuotaModal plan={currentPlan} onClose={() => setShowQuotaModal(false)} t={t} />
      )}
      <div className="mx-auto max-w-workspace px-4 py-8 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <div className="mb-8 max-w-task animate-fade-in sm:mb-10">
          <p className="ui-eyebrow mb-3">
            {isRetakeCoachFlow ? coachCopy.label : t('workspace_label')}
          </p>
          <h1 className="text-balance font-display text-4xl text-ink sm:text-5xl">
            {isRetakeCoachFlow ? coachCopy.workspaceTitle : t('workspace_headline')}
          </h1>
          {isRetakeCoachFlow && (
            <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted">{coachCopy.workspaceBody}</p>
          )}
          <QuotaBanner
            usage={usage}
            usageError={usageError}
            remainingQuota={remainingQuota}
            totalQuota={totalQuota}
            reviewMode={reviewMode}
            t={t}
          />
        </div>

        <div className="animate-slide-up anim-fill-both delay-100">
          {unresolvedPracticeSession && (
            <p role={practiceError ? 'alert' : 'status'} className="ui-panel mb-6 max-w-task p-5 text-sm text-ink-muted">
              {practiceError || t('practice_loading')}
            </p>
          )}
          {practiceGoalPanel && <div className="mb-6">{practiceGoalPanel}</div>}
          {!preview ? (
            <div className="space-y-6">
              {isRetakeCoachFlow && (
                <RetakeWorkspaceIntro
                  copy={coachCopy}
                  sourcePhotoUrl={trustedSourcePhotoUrl}
                  sourceLoading={trustedSourceLoading}
                  sourceError={trustedSourceError}
                />
              )}
              {canUploadRetake && (
                <WorkspaceTaskShell
                  copy={flowCopy}
                  activeStep="image"
                  image={
                    <div className="space-y-4">
                      {stage === 'error' && errMessage && (
                        <div role="alert" className="flex items-start gap-2 rounded-control border border-rust/25 bg-rust/10 px-3 py-2.5 text-sm text-rust animate-scale-in">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                          <span>{errMessage}</span>
                        </div>
                      )}
                      <ImageUploader
                        onFileSelected={handleFileSelected}
                        disabled={stage !== 'idle' && stage !== 'error'}
                      />
                    </div>
                  }
                />
              )}
            </div>
          ) : (
            <WorkspaceTaskShell
              copy={flowCopy}
              activeStep={activeTaskStep}
              completedSteps={[...completedTaskSteps]}
              image={
                <div className="space-y-4">
                  <div className="relative overflow-hidden rounded-card border border-border bg-raised">
                    {trustedSourceReviewId && trustedSourcePhotoUrl ? (
                      <div className="grid grid-cols-2 gap-px bg-border-subtle">
                        <div className="bg-raised p-2 sm:p-3">
                          <p className="mb-2 text-xs font-medium text-ink-subtle">{targetCopy.originalLabel}</p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface">
                            <Image src={trustedSourcePhotoUrl} alt={targetCopy.originalLabel} fill className="object-contain" unoptimized />
                          </div>
                        </div>
                        <div className="bg-raised p-2 sm:p-3">
                          <p className="mb-2 text-xs font-medium text-ink-subtle">{uploadedPracticePhotoLabel}</p>
                          <div className="relative aspect-[4/3] overflow-hidden rounded-control bg-surface">
                            <Image src={preview} alt={uploadedPracticePhotoLabel} fill className="object-contain" unoptimized />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="photo-frame group relative aspect-[4/3] bg-raised">
                        <Image
                          src={preview}
                          alt={t('uploader_preview_alt')}
                          fill
                          className="object-contain transition-transform duration-300 group-hover:scale-[1.01]"
                          unoptimized
                        />
                      </div>
                    )}

                    {stage === 'uploading' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-void/80 px-6 text-center backdrop-blur-sm animate-fade-in">
                        <LoadingSpinner size={32} />
                        <div className="flex w-full max-w-52 flex-col items-center gap-2">
                          <p className="text-sm font-bold text-gold">{t('stage_uploading')} {uploadProgress}%</p>
                          <div className="h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/10">
                            <div
                              className="h-full rounded-full bg-action transition-[width] duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                    {stage === 'confirming' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-void/80 px-6 text-center backdrop-blur-sm animate-fade-in">
                        <LoadingSpinner size={32} label={t('stage_confirming')} />
                      </div>
                    )}
                  </div>

                  {selectedFile && (
                    <div className="flex items-center justify-between gap-3 rounded-control border border-border-subtle bg-surface/50 px-3 py-2 font-mono text-[11px] text-ink-subtle">
                      <span className="min-w-0 truncate">{selectedFile.name}</span>
                      <span className="shrink-0 font-bold text-ink-muted">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                    </div>
                  )}

                  {hasReadyPhoto && (
                    <div role="status" className="flex items-start gap-2 rounded-control border border-sage/25 bg-sage/10 px-3 py-2.5 text-sm text-sage animate-scale-in">
                      <CheckCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span className="font-medium">{t('photo_ready_msg')}</span>
                    </div>
                  )}

                  {(stage === 'rejected' || stage === 'error') && (
                    <div role="alert" className="flex items-start gap-2 rounded-control border border-rust/25 bg-rust/10 px-3 py-2.5 text-sm text-rust animate-scale-in">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                      <span>{errMessage}</span>
                    </div>
                  )}

                  {(stage === 'rejected' || stage === 'error') && (
                    <button type="button" onClick={handleReset} className="ui-action-secondary min-h-12 w-full px-6 py-3 text-sm">
                      {t('btn_reupload')}
                    </button>
                  )}
                </div>
              }
              settings={
                stage === 'ready' && photo ? (
                  <WorkspaceSettingsPanel
                    imageType={imageType}
                    reviewMode={reviewMode}
                    reviewModel={selectedReviewModel}
                    isGuest={isGuest}
                    locale={locale}
                    showReviewModel={!isRetakeCoachFlow && !isPracticePairedFlow}
                    remainingQuota={remainingQuota}
                    totalQuota={totalQuota}
                    onImageTypeChange={setImageType}
                    onReviewModeChange={setReviewMode}
                    onReviewModelChange={setReviewModel}
                    t={t}
                  />
                ) : undefined
              }
              submit={
                photo && !savedPracticeClosed && (stage === 'ready' || stage === 'reviewing') ? (
                  <WorkspaceSubmitPanel
                    imageType={imageType}
                    reviewMode={reviewMode}
                    reviewModel={selectedReviewModel}
                    locale={locale}
                    remainingQuota={remainingQuota}
                    totalQuota={totalQuota}
                    isSubmitting={stage === 'reviewing'}
                    errorMessage={hasSubmitError ? errMessage : undefined}
                    secondaryLabel={t('btn_change_photo')}
                    onSubmit={handleReview}
                    onSecondary={handleReset}
                    t={t}
                  />
                ) : undefined
              }
            />
          )}
          <ProPromoCard
            plan={currentPlan}
            scene="workspace"
            fallbackRedirectUrl="/workspace"
            className="mt-12 animate-slide-up anim-fill-both delay-150"
          />
        </div>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <WorkspacePageContent />
    </Suspense>
  );
}
