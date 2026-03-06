'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, AlertCircle, Info, Zap, Star } from 'lucide-react';
import Image from 'next/image';
import {
  createPresign,
  putObjectStorage,
  confirmPhoto,
  createReview,
  getUsage,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { planLabel, planColor } from '@/lib/auth-context';
import {
  ApiException,
  PhotoCreateResponse,
  UsageResponse,
  ReviewCreateAsyncResponse,
  ReviewCreateSyncResponse,
} from '@/lib/types';
import ImageUploader from '@/components/upload/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Badge from '@/components/ui/Badge';

// ─── Types ────────────────────────────────────────────────────────────────────

type Stage =
  | 'idle'
  | 'uploading'
  | 'confirming'
  | 'ready'
  | 'rejected'
  | 'reviewing'
  | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractClientMeta(
  file: File,
  extra?: { width?: number; height?: number; original_size?: number }
): Record<string, unknown> {
  return {
    original_filename: file.name,
    mime: file.type,
    size_bytes: file.size,
    last_modified: new Date(file.lastModified).toISOString(),
    ...(extra?.width ? { width: extra.width } : {}),
    ...(extra?.height ? { height: extra.height } : {}),
    ...(extra?.original_size ? { original_size: extra.original_size } : {}),
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WorkspacePage() {
  const router = useRouter();
  const { userInfo, ensureToken, isLoading: authLoading } = useAuth();

  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [usageError, setUsageError] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [photo, setPhoto] = useState<PhotoCreateResponse | null>(null);
  const [errMessage, setErrMessage] = useState('');

  const [reviewMode, setReviewMode] = useState<'flash' | 'pro'>('flash');

  // ── Fetch usage ────────────────────────────────────────────────────────────

  const fetchUsage = useCallback(async () => {
    try {
      const token = await ensureToken();
      const data = await getUsage(token);
      setUsage(data);
    } catch {
      setUsageError(true);
    }
  }, [ensureToken]);

  useEffect(() => {
    if (!authLoading) fetchUsage();
  }, [authLoading, fetchUsage]);

  // ── File selected → upload flow ────────────────────────────────────────────

  const handleFileSelected = useCallback(
    async (file: File, dataUrl: string) => {
      setSelectedFile(file);
      setPreview(dataUrl);
      setStage('uploading');
      setUploadProgress(0);
      setErrMessage('');

      // Decode image dimensions from the preview dataUrl
      let imgWidth = 0;
      let imgHeight = 0;
      try {
        const bmp = await createImageBitmap(file);
        imgWidth = bmp.width;
        imgHeight = bmp.height;
        bmp.close();
      } catch {
        // non-critical
      }

      try {
        const token = await ensureToken();

        // 1. Presign
        const presign = await createPresign(
          {
            filename: file.name,
            content_type: file.type,
            size_bytes: file.size,
          },
          token
        );

        // 2. PUT to object storage
        await putObjectStorage(presign.put_url, file, presign.headers, (pct) => {
          setUploadProgress(pct);
        });

        // 3. Confirm photo
        setStage('confirming');
        const photoData = await confirmPhoto(
          presign.upload_id,
          {},
          extractClientMeta(file, { width: imgWidth, height: imgHeight }),
          token
        );

        setPhoto(photoData);

        if (photoData.status === 'READY') {
          // Persist photo_url so the review result page can display the photo
          try {
            const cache = JSON.parse(localStorage.getItem('ps_photo_urls') || '{}');
            cache[photoData.photo_id] = photoData.photo_url;
            // Keep only the last 20 entries to avoid unbounded growth
            const keys = Object.keys(cache);
            if (keys.length > 20) delete cache[keys[0]];
            localStorage.setItem('ps_photo_urls', JSON.stringify(cache));
          } catch { /* non-critical */ }
          setStage('ready');
          fetchUsage();
        } else if (photoData.status === 'REJECTED') {
          setStage('rejected');
          setErrMessage('该图片未通过内容审核，无法评图');
        } else {
          setStage('error');
          setErrMessage(`照片状态异常：${photoData.status}`);
        }
      } catch (err) {
        setStage('error');
        if (err instanceof ApiException) {
          if (err.status === 429) {
            setErrMessage('当前操作过于频繁，请稍后再试');
          } else if (err.status === 402 || err.code === 'QUOTA_EXCEEDED') {
            setErrMessage('今日评图额度已用完，请明日再来或升级套餐');
          } else {
            setErrMessage(err.message);
          }
        } else {
          setErrMessage('上传失败，请检查网络后重试');
        }
      }
    },
    [ensureToken, fetchUsage]
  );

  // ── Submit review ──────────────────────────────────────────────────────────

  const handleReview = useCallback(async () => {
    if (!photo) return;
    setStage('reviewing');
    setErrMessage('');

    try {
      const token = await ensureToken();
      const idempotencyKey = `${photo.photo_id}-${reviewMode}-${Date.now()}`;
      const result = await createReview(
        {
          photo_id: photo.photo_id,
          mode: reviewMode,
          async: true,
          idempotency_key: idempotencyKey,
        },
        token
      );

      if ('task_id' in result) {
        const async_result = result as ReviewCreateAsyncResponse;
        router.push(`/tasks/${async_result.task_id}`);
      } else {
        const sync_result = result as ReviewCreateSyncResponse;
        router.push(`/reviews/${sync_result.review_id}`);
      }
    } catch (err) {
      setStage('ready');
      if (err instanceof ApiException) {
        if (err.status === 429) {
          setErrMessage('请求过于频繁，请稍后重试');
        } else if (err.code === 'QUOTA_EXCEEDED') {
          setErrMessage('今日评图额度已用完');
        } else {
          setErrMessage(err.message);
        }
      } else {
        setErrMessage('发起点评失败，请重试');
      }
    }
  }, [photo, reviewMode, ensureToken, router]);

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setPhoto(null);
    setStage('idle');
    setErrMessage('');
    setUploadProgress(0);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="pt-14 min-h-screen">
      <div className="max-w-3xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-10 animate-fade-in">
          <p className="text-xs text-gold/70 font-mono mb-3 tracking-widest uppercase">
            — 评图工作台
          </p>
          <h1 className="font-display text-4xl sm:text-5xl mb-4">上传照片</h1>

          {/* Usage bar */}
          {usage && (
            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs">
                <span className={`font-medium ${planColor(usage.plan)}`}>
                  {planLabel(usage.plan)}
                </span>
              </span>
              <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                <Info size={11} />
                今日剩余
                <span className="text-ink font-medium">
                  {usage.quota.remaining} / {usage.quota.daily_total}
                </span>
                次
              </div>
              {usage.quota.remaining === 0 && (
                <Badge variant="rust">额度已用尽</Badge>
              )}
            </div>
          )}

          {usageError && (
            <p className="text-xs text-ink-subtle mt-2">无法获取额度信息</p>
          )}
        </div>

        {/* Upload zone or preview */}
        <div className="animate-slide-up">
          {!preview ? (
            <ImageUploader
              onFileSelected={handleFileSelected}
              disabled={stage !== 'idle' && stage !== 'error'}
            />
          ) : (
            <div className="space-y-5">
              {/* Image preview */}
              <div className="photo-frame relative aspect-[4/3] rounded-lg overflow-hidden border border-border bg-raised">
                <Image
                  src={preview}
                  alt="Preview"
                  fill
                  className="object-contain"
                  unoptimized
                />

                {/* Progress overlay */}
                {stage === 'uploading' && (
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} />
                    <p className="text-sm text-ink-muted">上传中 {uploadProgress}%</p>
                    <div className="w-40 h-0.5 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gold rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {stage === 'confirming' && (
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} label="确认照片中…" />
                  </div>
                )}

                {stage === 'reviewing' && (
                  <div className="absolute inset-0 bg-void/70 flex flex-col items-center justify-center gap-3">
                    <LoadingSpinner size={32} label="提交点评请求…" />
                  </div>
                )}
              </div>

              {/* File info */}
              {selectedFile && (
                <div className="flex items-center justify-between text-xs text-ink-subtle font-mono">
                  <span className="truncate max-w-[200px]">{selectedFile.name}</span>
                  <span>{(selectedFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              )}

              {/* Status messages */}
              {stage === 'ready' && photo && (
                <div className="flex items-center gap-2 text-sage text-sm">
                  <CheckCircle size={14} />
                  <span>照片上传成功，可以开始评图</span>
                </div>
              )}

              {(stage === 'rejected' || stage === 'error') && (
                <div className="flex items-center gap-2 text-rust text-sm bg-rust/5 border border-rust/20 rounded px-3 py-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{errMessage}</span>
                </div>
              )}

              {/* Review mode selector */}
              {stage === 'ready' && photo && (
                <>
                  <div>
                    <p className="text-xs text-ink-muted mb-3">选择点评模式</p>
                    <div className="grid grid-cols-2 gap-3">
                      {(
                        [
                          {
                            id: 'flash' as const,
                            icon: Zap,
                            title: 'Flash',
                            desc: '极速点评，秒级响应',
                          },
                          {
                            id: 'pro' as const,
                            icon: Star,
                            title: 'Pro',
                            desc: '深度分析，专业建议',
                          },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setReviewMode(m.id)}
                          className={`
                            flex items-start gap-3 p-4 rounded-lg border text-left transition-all
                            ${
                              reviewMode === m.id
                                ? 'border-gold/60 bg-gold/5'
                                : 'border-border hover:border-border-subtle'
                            }
                          `}
                        >
                          <m.icon
                            size={16}
                            className={reviewMode === m.id ? 'text-gold mt-0.5' : 'text-ink-subtle mt-0.5'}
                          />
                          <div>
                            <p
                              className={`text-sm font-medium ${
                                reviewMode === m.id ? 'text-gold' : 'text-ink'
                              }`}
                            >
                              {m.title}
                            </p>
                            <p className="text-xs text-ink-muted mt-0.5">{m.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleReview}
                      className="flex-1 px-6 py-3 bg-gold text-void text-sm font-medium rounded hover:bg-gold-light transition-colors"
                    >
                      开始 {reviewMode === 'pro' ? 'Pro' : 'Flash'} 点评
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-4 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 transition-colors"
                    >
                      换张照片
                    </button>
                  </div>
                </>
              )}

              {/* Error reset */}
              {(stage === 'rejected' || stage === 'error') && (
                <button
                  onClick={handleReset}
                  className="w-full px-6 py-3 border border-border text-ink-muted text-sm rounded hover:border-gold/40 transition-colors"
                >
                  重新上传
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
