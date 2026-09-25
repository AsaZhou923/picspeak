'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { ReviewGetResponse } from '@/lib/types';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { isAbortError } from '@/lib/api';
import { ReviewOrganizationPanel } from '@/features/reviews/components/ReviewOrganizationPanel';
import { ReviewVisibilityPanel } from '@/features/reviews/components/ReviewVisibilityPanel';
import {
  createOrganizedReviewShare,
  disableReviewPublicVisibility,
  getReviewVisibility,
  revokeReviewShare,
  updateOrganizedReviewMeta,
  type ReviewVisibilityResponse,
} from '@/features/reviews/api/reviewOrganizationApi';

export type ReviewOwnerToolsPatch = Partial<Pick<
  ReviewGetResponse,
  'tags' | 'note' | 'gallery_visible' | 'gallery_audit_status' | 'gallery_added_at' | 'gallery_rejected_reason'
>>;

export function ReviewOwnerTools({
  review,
  onUpdated,
  onRefresh,
  externalVersion,
  onAddGallery,
  actionBusy = false,
  onBusyChange,
}: {
  review: ReviewGetResponse | null;
  onUpdated?: (patch: ReviewOwnerToolsPatch) => void;
  onRefresh?: () => void;
  externalVersion?: string;
  onAddGallery: () => void;
  actionBusy?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { ensureToken, userInfo } = useAuth();
  const { locale, t } = useI18n();
  const [visibility, setVisibility] = useState<ReviewVisibilityResponse | null>(null);
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const [visibilityError, setVisibilityError] = useState('');
  const [visibilityStatus, setVisibilityStatus] = useState('');
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [organizationStatus, setOrganizationStatus] = useState('');
  const requestRef = useRef(0);
  const onUpdatedRef = useRef(onUpdated);
  onUpdatedRef.current = onUpdated;

  useEffect(() => {
    onBusyChange?.(visibilityBusy || organizationBusy);
  }, [visibilityBusy, organizationBusy, onBusyChange]);

  const item = useMemo(() => {
    if (!review?.viewer_is_owner) return null;
    return {
      review_id: review.review_id,
      tags: review.tags,
      note: review.note,
      created_at: review.created_at,
      final_score: review.result.final_score,
    };
  }, [review]);
  const itemReviewId = item?.review_id ?? null;

  useEffect(() => {
    setVisibilityStatus('');
    setOrganizationStatus('');
  }, [locale, itemReviewId]);

  const loadVisibility = useCallback(async (reviewId: string, signal?: AbortSignal) => {
    const requestId = ++requestRef.current;
    setVisibilityBusy(true);
    setVisibilityError('');
    try {
      const token = await ensureToken();
      const nextVisibility = await getReviewVisibility(reviewId, token, signal);
      if (signal?.aborted || requestId !== requestRef.current) return null;
      setVisibility(nextVisibility);
      onUpdatedRef.current?.({
        gallery_visible: nextVisibility.gallery_visible,
        gallery_audit_status: nextVisibility.gallery_audit_status,
        gallery_added_at: nextVisibility.gallery_added_at,
        gallery_rejected_reason: nextVisibility.gallery_rejected_reason,
      });
      return nextVisibility;
    } catch (err) {
      if (isAbortError(err) || signal?.aborted || requestId !== requestRef.current) return null;
      setVisibility(null);
      setVisibilityError(formatUserFacingError(t, err, t('reviews_err_fetch')));
      return null;
    } finally {
      if (!signal?.aborted && requestId === requestRef.current) setVisibilityBusy(false);
    }
  }, [ensureToken, t]);

  useEffect(() => {
    if (!itemReviewId) {
      setVisibility(null);
      setVisibilityError('');
      return;
    }
    const controller = new AbortController();
    loadVisibility(itemReviewId, controller.signal);
    return () => controller.abort();
  }, [itemReviewId, loadVisibility, externalVersion]);

  if (!item) return null;
  const organizationSummary = locale === 'zh'
    ? '标签与备注'
    : locale === 'ja'
      ? 'タグとメモ'
      : 'Tags and notes';

  const handleSaveOrganization = async (payload: { tags: string[]; note: string }) => {
    setOrganizationBusy(true);
    setOrganizationStatus('');
    try {
      const token = await ensureToken();
      const meta = await updateOrganizedReviewMeta(item.review_id, payload, token);
      onUpdated?.({
        tags: meta.tags,
        note: meta.note,
        gallery_visible: meta.gallery_visible,
        gallery_audit_status: meta.gallery_audit_status,
        gallery_added_at: meta.gallery_added_at,
        gallery_rejected_reason: meta.gallery_rejected_reason,
      });
      setOrganizationStatus('saved');
    } catch (err) {
      setOrganizationStatus(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setOrganizationBusy(false);
    }
  };

  const handleCreateShare = async () => {
    setVisibilityBusy(true);
    setVisibilityError('');
    try {
      const token = await ensureToken();
      await createOrganizedReviewShare(item.review_id, token);
      await loadVisibility(item.review_id);
      onRefresh?.();
    } catch (err) {
      setVisibilityError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    setVisibilityBusy(true);
    setVisibilityError('');
    try {
      const token = await ensureToken();
      const nextVisibility = await revokeReviewShare(item.review_id, token);
      setVisibility(nextVisibility);
      onRefresh?.();
    } catch (err) {
      setVisibilityError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleRemoveGallery = async () => {
    setVisibilityBusy(true);
    setVisibilityError('');
    try {
      const token = await ensureToken();
      const meta = await updateOrganizedReviewMeta(item.review_id, { gallery_visible: false }, token);
      onUpdated?.({
        gallery_visible: meta.gallery_visible,
        gallery_audit_status: meta.gallery_audit_status,
        gallery_added_at: meta.gallery_added_at,
        gallery_rejected_reason: meta.gallery_rejected_reason,
      });
      await loadVisibility(item.review_id);
      onRefresh?.();
    } catch (err) {
      setVisibilityError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleStopAll = async () => {
    setVisibilityBusy(true);
    setVisibilityError('');
    try {
      const token = await ensureToken();
      const nextVisibility = await disableReviewPublicVisibility(item.review_id, token);
      setVisibility(nextVisibility);
      onUpdated?.({
        gallery_visible: nextVisibility.gallery_visible,
        gallery_audit_status: nextVisibility.gallery_audit_status,
        gallery_added_at: nextVisibility.gallery_added_at,
        gallery_rejected_reason: nextVisibility.gallery_rejected_reason,
      });
      onRefresh?.();
    } catch (err) {
      setVisibilityError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div id="review-sharing" tabIndex={-1} className="scroll-mt-28 rounded-card">
        <ReviewVisibilityPanel
          item={{ review_id: item.review_id }}
          locale={locale}
          visibility={visibility}
          busy={visibilityBusy || organizationBusy || actionBusy}
          error={visibilityError}
          status={visibilityStatus}
          onStatus={setVisibilityStatus}
          onRefresh={() => loadVisibility(item.review_id)}
          onCreateShare={handleCreateShare}
          onRevokeShare={handleRevokeShare}
          onRemoveGallery={handleRemoveGallery}
          onStopAll={handleStopAll}
          onAddGallery={onAddGallery}
          galleryRequiresSignIn={userInfo?.plan === 'guest'}
        />
      </div>
      <details className="group rounded-card border border-border-subtle bg-void/20">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-sm font-semibold text-ink marker:content-none">
          <span>{organizationSummary}</span>
          <ChevronDown size={15} className="text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-border-subtle p-3 sm:p-4">
          <ReviewOrganizationPanel
            item={item}
            items={[item]}
            locale={locale}
            busy={organizationBusy || visibilityBusy || actionBusy}
            status={organizationStatus}
            showItemSelect={false}
            onSelect={() => undefined}
            onSave={handleSaveOrganization}
          />
        </div>
      </details>
    </div>
  );
}
