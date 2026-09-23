'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, ChevronRight, RefreshCw, Repeat2, SlidersHorizontal } from 'lucide-react';
import {
  getPracticeLegacyComparisons,
  getPracticeSession,
  getPracticeSessions,
  getPracticeSummary,
  isAbortError,
  updatePracticeSession,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  ImageType,
  PracticeKind,
  PracticeLifecycle,
  PracticeSessionListItem,
  PracticeSessionResponse,
  PracticeSessionsQuery,
  PracticeSummaryResponse,
  RetakeDimensionKey,
  ReviewHistoryItem,
} from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { buildHistoryGrowthSnapshot } from '@/lib/review-growth';
import ProPromoCard from '@/components/marketing/ProPromoCard';
import { getProUpgradeTriggerCopy } from '@/lib/pro-conversion';
import {
  displayDateToIso,
  isInvalidCompletedDate,
} from '@/lib/date-filters';
import {
  getHistoryCopy,
  getHistoryGrowthCopy,
  getHistoryPracticeThemeCopy,
  getImageTypeLabel,
} from '@/lib/review-history-copy';
import {
  DateFilterField,
  ReviewCard,
  ReviewGrowthPanel,
  ReviewHistorySkeletonList,
} from '@/features/reviews/components/ReviewHistoryPanels';
import { RetakeProgressPanel } from '@/features/reviews/components/RetakeProgressPanel';
import { getRetakeCoachCopy } from '@/lib/retake-coach-copy';
import {
  isFreshPracticeRequest,
  type PracticeJournalCopy,
} from '@/features/practice/journal';
import {
  LegacyRetakeList,
  PracticeJournalEmpty,
  PracticeJournalLoading,
  PracticeSessionCard,
  PracticeSessionDetail,
  PracticeSummaryPanel,
} from '@/features/practice/components/PracticeJournalPanels';
import { ReviewOrganizationPanel } from '@/features/reviews/components/ReviewOrganizationPanel';
import { ReviewVisibilityPanel } from '@/features/reviews/components/ReviewVisibilityPanel';
import {
  createOrganizedReviewShare,
  disableReviewPublicVisibility,
  getOrganizedMyReviews,
  getReviewVisibility,
  revokeReviewShare,
  updateOrganizedReviewMeta,
  type OrganizedReviewHistoryQuery,
  type ReviewVisibilityResponse,
} from '@/features/reviews/api/reviewOrganizationApi';

type FilterDraft = {
  createdFrom: string;
  createdTo: string;
  minScore: string;
  maxScore: string;
  imageType: '' | ImageType;
  q: string;
  tag: string;
};

type HistoryView = 'reviews' | 'practice';

type PracticeFilters = {
  lifecycle: PracticeLifecycle | 'all';
  dimension: RetakeDimensionKey | 'all';
  practiceKind: PracticeKind | 'all';
};

const EMPTY_FILTERS: FilterDraft = {
  createdFrom: '',
  createdTo: '',
  minScore: '',
  maxScore: '',
  imageType: '',
  q: '',
  tag: '',
};

const EMPTY_PRACTICE_FILTERS: PracticeFilters = {
  lifecycle: 'all',
  dimension: 'all',
  practiceKind: 'all',
};

const PRACTICE_DIMENSIONS: RetakeDimensionKey[] = ['composition', 'lighting', 'color', 'impact', 'technical'];
const PRACTICE_KINDS: PracticeKind[] = ['capture_retake', 'edit_revision', 'same_image_recheck'];
const IMAGE_TYPES: ImageType[] = ['default', 'landscape', 'portrait', 'street', 'still_life', 'architecture'];

function toQuery(filters: FilterDraft): OrganizedReviewHistoryQuery {
  const query: OrganizedReviewHistoryQuery = { limit: 20 };

  const createdFromIso = displayDateToIso(filters.createdFrom);
  const createdToIso = displayDateToIso(filters.createdTo);

  if (createdFromIso) {
    query.created_from = new Date(`${createdFromIso}T00:00:00`).toISOString();
  }
  if (createdToIso) {
    query.created_to = new Date(`${createdToIso}T23:59:59.999`).toISOString();
  }
  if (filters.minScore !== '') {
    query.min_score = Number(filters.minScore);
  }
  if (filters.maxScore !== '') {
    query.max_score = Number(filters.maxScore);
  }
  if (filters.imageType) {
    query.image_type = filters.imageType;
  }
  const q = filters.q.replace(/\s+/g, ' ').trim();
  if (q) {
    query.q = q;
  }
  const tags = filters.tag
    .split(/[,\n#]/)
    .map((tag) => tag.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (tags.length > 0) {
    query.tag = tags;
  }

  return query;
}

function toPracticeQuery(filters: PracticeFilters): PracticeSessionsQuery {
  return {
    limit: 20,
    lifecycle: filters.lifecycle,
    dimension: filters.dimension,
    practice_kind: filters.practiceKind,
  };
}

function formatPracticeGenre(locale: string, genre: string | null): string | null {
  if (!genre) return null;
  if (IMAGE_TYPES.includes(genre as ImageType)) {
    return getImageTypeLabel(locale, genre as ImageType);
  }
  return genre;
}

export default function ReviewHistoryPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ensureToken, userInfo } = useAuth();
  const { t, locale } = useI18n();
  const copy = useMemo(() => getHistoryCopy(locale), [locale]);
  const retakeCopy = useMemo(() => getRetakeCoachCopy(locale), [locale]);
  const growthCopy = useMemo(() => getHistoryGrowthCopy(locale), [locale]);
  const plan = userInfo?.plan ?? 'guest';
  const historyPromoCopy = useMemo(() => getProUpgradeTriggerCopy(locale, 'history_trend'), [locale]);

  const initialView = searchParams.get('view') === 'practice' ? 'practice' : 'reviews';
  const [view, setView] = useState<HistoryView>(initialView);
  const [items, setItems] = useState<ReviewHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [draftFilters, setDraftFilters] = useState<FilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<FilterDraft>(EMPTY_FILTERS);

  const [practiceItems, setPracticeItems] = useState<PracticeSessionListItem[]>([]);
  const [practiceCursor, setPracticeCursor] = useState<string | null>(null);
  const [practiceHasMore, setPracticeHasMore] = useState(false);
  const [practiceLoading, setPracticeLoading] = useState(true);
  const [practiceLoadingMore, setPracticeLoadingMore] = useState(false);
  const [practiceError, setPracticeError] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [practiceFilters, setPracticeFilters] = useState<PracticeFilters>(EMPTY_PRACTICE_FILTERS);
  const [practiceSummary, setPracticeSummary] = useState<PracticeSummaryResponse | null>(null);
  const [legacyRetakes, setLegacyRetakes] = useState<ReviewHistoryItem[]>([]);
  const [legacyCursor, setLegacyCursor] = useState<string | null>(null);
  const [legacyHasMore, setLegacyHasMore] = useState(false);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [legacyLoadingMore, setLegacyLoadingMore] = useState(false);
  const [legacyError, setLegacyError] = useState('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<PracticeSessionResponse | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);
  const [selectedError, setSelectedError] = useState('');
  const [lifecycleBusyId, setLifecycleBusyId] = useState<string | null>(null);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [reviewVisibility, setReviewVisibility] = useState<ReviewVisibilityResponse | null>(null);
  const [organizationBusy, setOrganizationBusy] = useState(false);
  const [organizationStatus, setOrganizationStatus] = useState('');
  const [visibilityBusy, setVisibilityBusy] = useState(false);
  const practiceListRequestRef = useRef(0);
  const practiceListAbortRef = useRef<AbortController | null>(null);
  const practiceSummaryRequestRef = useRef(0);
  const practiceSummaryAbortRef = useRef<AbortController | null>(null);
  const practiceDetailRequestRef = useRef(0);
  const legacyRequestRef = useRef(0);
  const legacyAbortRef = useRef<AbortController | null>(null);

  const createdFromInvalid = isInvalidCompletedDate(draftFilters.createdFrom);
  const createdToInvalid = isInvalidCompletedDate(draftFilters.createdTo);
  const hasInvalidDate = createdFromInvalid || createdToInvalid;
  const dimensionLabels = useMemo(
    () => ({
      composition: t('score_composition'),
      lighting: t('score_lighting'),
      color: t('score_color'),
      impact: t('score_impact'),
      technical: t('score_technical'),
    }),
    [t]
  );
  const growthWindowItems = useMemo(() => {
    const sortedItems = [...items].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    return plan === 'pro' ? sortedItems : sortedItems.slice(0, 6);
  }, [items, plan]);
  const growthSnapshot = useMemo(() => buildHistoryGrowthSnapshot(growthWindowItems), [growthWindowItems]);
  const selectedReview = useMemo(
    () => items.find((item) => item.review_id === selectedReviewId) ?? items[0] ?? null,
    [items, selectedReviewId],
  );
  const practiceThemeCopy = useMemo(
    () => getHistoryPracticeThemeCopy(
      locale,
      dimensionLabels[growthSnapshot.practiceTheme.dimension],
      growthSnapshot.practiceTheme.intensity,
      plan === 'pro',
      growthSnapshot.practiceTheme.reviewCount,
      items.length,
    ),
    [dimensionLabels, growthSnapshot.practiceTheme, items.length, locale, plan]
  );

  const practiceLabels = useMemo<PracticeJournalCopy>(() => ({
    assessment: {
      achieved: t('practice_assessment_achieved'),
      partial: t('practice_assessment_partial'),
      not_achieved: t('practice_assessment_not_achieved'),
      indeterminate: t('practice_assessment_indeterminate'),
      unknown: t('practice_assessment_unknown'),
      failed: t('practice_assessment_failed'),
    },
    attemptState: {
      not_started: t('practice_attempt_not_started'),
      pending: t('practice_attempt_pending'),
      failed: t('practice_attempt_failed'),
      success: t('practice_attempt_success'),
    },
    lifecycle: {
      active: t('practice_lifecycle_active'),
      completed: t('practice_lifecycle_completed'),
      archived: t('practice_lifecycle_archived'),
    },
    kind: {
      capture_retake: t('practice_kind_capture_retake'),
      edit_revision: t('practice_kind_edit_revision'),
      same_image_recheck: t('practice_kind_same_image_recheck'),
    },
    sourceAccess: {
      available: t('practice_source_available'),
      hidden: t('practice_source_hidden'),
      deleted: t('practice_source_deleted'),
      expired: t('practice_source_expired'),
      photo_unavailable: t('practice_source_photo_unavailable'),
    },
  }), [t]);

  const fetchPage = useCallback(
    async (nextCursor?: string, activeFilters: FilterDraft = appliedFilters, signal?: AbortSignal) => {
      try {
        const token = await ensureToken();
        const data = await getOrganizedMyReviews(token, {
          ...toQuery(activeFilters),
          cursor: nextCursor,
        }, signal);

        if (signal?.aborted) return;
        if (nextCursor) {
          setItems((prev) => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }

        setCursor(data.next_cursor);
        setHasMore(data.next_cursor !== null);
        setError('');
      } catch (err) {
        if (isAbortError(err)) return;
        setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
      }
    },
    [appliedFilters, ensureToken, t]
  );

  const fetchPracticeSummary = useCallback(
    async (signal?: AbortSignal) => {
      const requestId = ++practiceSummaryRequestRef.current;
      try {
        setSummaryLoading(true);
        setSummaryError('');
        const token = await ensureToken();
        const summaryData = await getPracticeSummary(token, signal);
        if (!isFreshPracticeRequest(requestId, practiceSummaryRequestRef.current, signal)) return;
        setPracticeSummary(summaryData);
      } catch (err) {
        if (isAbortError(err) || !isFreshPracticeRequest(requestId, practiceSummaryRequestRef.current, signal)) return;
        setPracticeSummary(null);
        setSummaryError(formatUserFacingError(t, err, t('practice_summary_err_fetch')));
      } finally {
        if (isFreshPracticeRequest(requestId, practiceSummaryRequestRef.current, signal)) setSummaryLoading(false);
      }
    },
    [ensureToken, t]
  );

  const fetchPracticePage = useCallback(
    async (options: { cursor?: string; signal?: AbortSignal; reset?: boolean } = {}) => {
      const { cursor: nextCursor, signal, reset = !options.cursor } = options;
      const requestId = ++practiceListRequestRef.current;
      try {
        const token = await ensureToken();
        const sessionData = await getPracticeSessions(token, {
          ...toPracticeQuery(practiceFilters),
          cursor: nextCursor,
        }, signal);
        if (!isFreshPracticeRequest(requestId, practiceListRequestRef.current, signal)) return;

        if (nextCursor) {
          setPracticeItems((prev) => [...prev, ...sessionData.items]);
        } else {
          setPracticeItems(sessionData.items);
          if (reset) setSelectedSessionId(sessionData.items[0]?.session_id ?? null);
        }
        setPracticeCursor(sessionData.next_cursor);
        setPracticeHasMore(sessionData.next_cursor !== null);
        setPracticeError('');
      } catch (err) {
        if (isAbortError(err) || !isFreshPracticeRequest(requestId, practiceListRequestRef.current, signal)) return;
        setPracticeError(formatUserFacingError(t, err, t('practice_err_fetch')));
      }
    },
    [ensureToken, practiceFilters, t]
  );

  const fetchLegacyComparisons = useCallback(
    async (options: { cursor?: string; signal?: AbortSignal } = {}) => {
      const { cursor: nextCursor, signal } = options;
      const requestId = ++legacyRequestRef.current;
      try {
        const token = await ensureToken();
        const data = await getPracticeLegacyComparisons(token, { cursor: nextCursor, limit: 20 }, signal);
        if (!isFreshPracticeRequest(requestId, legacyRequestRef.current, signal)) return;
        if (nextCursor) {
          setLegacyRetakes((prev) => [...prev, ...data.items]);
        } else {
          setLegacyRetakes(data.items);
        }
        setLegacyCursor(data.next_cursor);
        setLegacyHasMore(data.next_cursor !== null);
        setLegacyError('');
      } catch (err) {
        if (isAbortError(err) || !isFreshPracticeRequest(requestId, legacyRequestRef.current, signal)) return;
        setLegacyError(formatUserFacingError(t, err, t('practice_legacy_err_fetch')));
      }
    },
    [ensureToken, t]
  );

  useEffect(() => {
    if (view !== 'reviews') return;
    const controller = new AbortController();
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setError('');
    setLoading(true);
    fetchPage(undefined, appliedFilters, controller.signal).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [fetchPage, appliedFilters, userInfo?.access_token, view]);

  useEffect(() => {
    const nextView = searchParams.get('view') === 'practice' ? 'practice' : 'reviews';
    setView(nextView);
  }, [searchParams]);

  useEffect(() => {
    if (view !== 'reviews' || items.length === 0) return;
    if (!selectedReviewId || !items.some((item) => item.review_id === selectedReviewId)) {
      setSelectedReviewId(items[0].review_id);
    }
  }, [items, selectedReviewId, view]);

  useEffect(() => {
    if (view !== 'reviews' || !selectedReview) {
      setReviewVisibility(null);
      return;
    }
    const controller = new AbortController();
    setVisibilityBusy(true);
    ensureToken()
      .then((token) => getReviewVisibility(selectedReview.review_id, token, controller.signal))
      .then((visibility) => {
        if (!controller.signal.aborted) setReviewVisibility(visibility);
      })
      .catch((err) => {
        if (!isAbortError(err) && !controller.signal.aborted) {
          setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setVisibilityBusy(false);
      });
    return () => controller.abort();
  }, [ensureToken, selectedReview, t, view]);

  useEffect(() => {
    if (view !== 'practice') return;
    practiceListAbortRef.current?.abort();
    practiceSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    const summaryController = new AbortController();
    practiceListAbortRef.current = controller;
    practiceSummaryAbortRef.current = summaryController;
    setPracticeItems([]);
    setPracticeCursor(null);
    setPracticeHasMore(false);
    setPracticeError('');
    setPracticeLoadingMore(false);
    setPracticeLoading(true);
    fetchPracticePage({ signal: controller.signal, reset: true }).finally(() => {
      if (!controller.signal.aborted && practiceListAbortRef.current === controller) setPracticeLoading(false);
    });
    fetchPracticeSummary(summaryController.signal);
    return () => {
      controller.abort();
      summaryController.abort();
    };
  }, [fetchPracticePage, fetchPracticeSummary, userInfo?.access_token, view]);

  useEffect(() => {
    if (view !== 'practice') return;
    legacyAbortRef.current?.abort();
    const controller = new AbortController();
    legacyAbortRef.current = controller;
    setLegacyRetakes([]);
    setLegacyCursor(null);
    setLegacyHasMore(false);
    setLegacyError('');
    setLegacyLoadingMore(false);
    setLegacyLoading(true);
    fetchLegacyComparisons({ signal: controller.signal }).finally(() => {
      if (!controller.signal.aborted && legacyAbortRef.current === controller) setLegacyLoading(false);
    });
    return () => controller.abort();
  }, [fetchLegacyComparisons, userInfo?.access_token, view]);

  useEffect(() => {
    if (view !== 'practice' || !selectedSessionId) {
      setSelectedSession(null);
      setSelectedError('');
      return;
    }
    const controller = new AbortController();
    const requestId = ++practiceDetailRequestRef.current;
    setSelectedLoading(true);
    setSelectedError('');
    ensureToken()
      .then((token) => getPracticeSession(selectedSessionId, token, controller.signal))
      .then((session) => {
        if (isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) setSelectedSession(session);
      })
      .catch((err) => {
        if (!isAbortError(err) && isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) {
          setSelectedSession(null);
          setSelectedError(formatUserFacingError(t, err, t('practice_detail_err_fetch')));
        }
      })
      .finally(() => {
        if (isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) setSelectedLoading(false);
      });
    return () => controller.abort();
  }, [ensureToken, selectedSessionId, t, view]);

  const handleLoadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(cursor);
    setLoadingMore(false);
  };

  const handleViewChange = (nextView: HistoryView) => {
    setView(nextView);
    const params = new URLSearchParams(searchParams.toString());
    if (nextView === 'reviews') {
      params.delete('view');
    } else {
      params.set('view', nextView);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const patchSelectedReview = (reviewId: string, patch: Partial<ReviewHistoryItem>) => {
    setItems((prev) => prev.map((item) => (item.review_id === reviewId ? { ...item, ...patch } : item)));
  };

  const refreshSelectedVisibility = async () => {
    if (!selectedReview) return;
    setVisibilityBusy(true);
    try {
      const token = await ensureToken();
      const visibility = await getReviewVisibility(selectedReview.review_id, token);
      setReviewVisibility(visibility);
      patchSelectedReview(selectedReview.review_id, {
        gallery_visible: visibility.gallery_visible,
        gallery_audit_status: visibility.gallery_audit_status,
        gallery_added_at: visibility.gallery_added_at,
        is_shared: visibility.share_enabled,
      });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleSaveOrganization = async (payload: { tags: string[]; note: string }) => {
    if (!selectedReview) return;
    setOrganizationBusy(true);
    setOrganizationStatus('');
    try {
      const token = await ensureToken();
      const meta = await updateOrganizedReviewMeta(selectedReview.review_id, payload, token);
      patchSelectedReview(selectedReview.review_id, {
        tags: meta.tags,
        note: meta.note,
        gallery_visible: meta.gallery_visible,
        gallery_audit_status: meta.gallery_audit_status,
        gallery_added_at: meta.gallery_added_at,
      });
      setOrganizationStatus('saved');
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setOrganizationBusy(false);
    }
  };

  const handleCreateShare = async () => {
    if (!selectedReview) return;
    setVisibilityBusy(true);
    try {
      const token = await ensureToken();
      await createOrganizedReviewShare(selectedReview.review_id, token);
      const visibility = await getReviewVisibility(selectedReview.review_id, token);
      setReviewVisibility(visibility);
      patchSelectedReview(selectedReview.review_id, { is_shared: visibility.share_enabled });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleRevokeShare = async () => {
    if (!selectedReview) return;
    setVisibilityBusy(true);
    try {
      const token = await ensureToken();
      const visibility = await revokeReviewShare(selectedReview.review_id, token);
      setReviewVisibility(visibility);
      patchSelectedReview(selectedReview.review_id, { is_shared: visibility.share_enabled });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleRemoveGallery = async () => {
    if (!selectedReview) return;
    setVisibilityBusy(true);
    try {
      const token = await ensureToken();
      const meta = await updateOrganizedReviewMeta(selectedReview.review_id, { gallery_visible: false }, token);
      patchSelectedReview(selectedReview.review_id, {
        gallery_visible: meta.gallery_visible,
        gallery_audit_status: meta.gallery_audit_status,
        gallery_added_at: meta.gallery_added_at,
      });
      const visibility = await getReviewVisibility(selectedReview.review_id, token);
      setReviewVisibility(visibility);
      patchSelectedReview(selectedReview.review_id, { is_shared: visibility.share_enabled });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handleStopAllPublic = async () => {
    if (!selectedReview) return;
    setVisibilityBusy(true);
    try {
      const token = await ensureToken();
      const visibility = await disableReviewPublicVisibility(selectedReview.review_id, token);
      setReviewVisibility(visibility);
      patchSelectedReview(selectedReview.review_id, {
        gallery_visible: visibility.gallery_visible,
        gallery_audit_status: visibility.gallery_audit_status,
        gallery_added_at: visibility.gallery_added_at,
        is_shared: visibility.share_enabled,
      });
    } catch (err) {
      setError(formatUserFacingError(t, err, t('reviews_err_fetch')));
    } finally {
      setVisibilityBusy(false);
    }
  };

  const handlePracticeLoadMore = async () => {
    if (!practiceCursor || practiceLoadingMore) return;
    practiceListAbortRef.current?.abort();
    const controller = new AbortController();
    practiceListAbortRef.current = controller;
    setPracticeLoadingMore(true);
    await fetchPracticePage({ cursor: practiceCursor, signal: controller.signal, reset: false });
    if (!controller.signal.aborted && practiceListAbortRef.current === controller) setPracticeLoadingMore(false);
  };

  const handlePracticeRetry = async () => {
    practiceListAbortRef.current?.abort();
    const controller = new AbortController();
    practiceListAbortRef.current = controller;
    setPracticeLoading(true);
    await fetchPracticePage({ signal: controller.signal, reset: true });
    if (!controller.signal.aborted && practiceListAbortRef.current === controller) setPracticeLoading(false);
  };

  const handleLegacyRetry = async () => {
    legacyAbortRef.current?.abort();
    const controller = new AbortController();
    legacyAbortRef.current = controller;
    setLegacyRetakes([]);
    setLegacyCursor(null);
    setLegacyHasMore(false);
    setLegacyError('');
    setLegacyLoadingMore(false);
    setLegacyLoading(true);
    await fetchLegacyComparisons({ signal: controller.signal });
    if (!controller.signal.aborted && legacyAbortRef.current === controller) setLegacyLoading(false);
  };

  const handleLegacyLoadMore = async () => {
    if (!legacyCursor || legacyLoadingMore) return;
    legacyAbortRef.current?.abort();
    const controller = new AbortController();
    legacyAbortRef.current = controller;
    setLegacyLoadingMore(true);
    await fetchLegacyComparisons({ cursor: legacyCursor, signal: controller.signal });
    if (!controller.signal.aborted && legacyAbortRef.current === controller) setLegacyLoadingMore(false);
  };

  const handleSummaryRetry = async () => {
    practiceSummaryAbortRef.current?.abort();
    const controller = new AbortController();
    practiceSummaryAbortRef.current = controller;
    await fetchPracticeSummary(controller.signal);
  };

  const handleDetailRetry = () => {
    setSelectedSessionId((current) => (current ? `${current}` : current));
    if (selectedSessionId) {
      const controller = new AbortController();
      const requestId = ++practiceDetailRequestRef.current;
      setSelectedLoading(true);
      setSelectedError('');
      ensureToken()
        .then((token) => getPracticeSession(selectedSessionId, token, controller.signal))
        .then((session) => {
          if (isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) setSelectedSession(session);
        })
        .catch((err) => {
          if (!isAbortError(err) && isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) {
            setSelectedSession(null);
            setSelectedError(formatUserFacingError(t, err, t('practice_detail_err_fetch')));
          }
        })
        .finally(() => {
          if (isFreshPracticeRequest(requestId, practiceDetailRequestRef.current, controller.signal)) setSelectedLoading(false);
        });
    }
  };

  const handleApplyFilters = () => {
    setAppliedFilters(draftFilters);
  };

  const handleResetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const handleLifecycle = async (sessionId: string, lifecycle: PracticeLifecycle) => {
    setLifecycleBusyId(sessionId);
    try {
      const token = await ensureToken();
      const session = await updatePracticeSession(sessionId, { lifecycle }, token);
      setSelectedSession(session);
      practiceListAbortRef.current?.abort();
      practiceSummaryAbortRef.current?.abort();
      const listController = new AbortController();
      const summaryController = new AbortController();
      practiceListAbortRef.current = listController;
      practiceSummaryAbortRef.current = summaryController;
      setPracticeLoading(true);
      await Promise.all([
        fetchPracticePage({ signal: listController.signal, reset: false }),
        fetchPracticeSummary(summaryController.signal),
      ]);
      if (!listController.signal.aborted && practiceListAbortRef.current === listController) setPracticeLoading(false);
      setPracticeError('');
    } catch (err) {
      setPracticeError(formatUserFacingError(t, err, t('practice_err_update')));
      setPracticeLoading(false);
    } finally {
      setLifecycleBusyId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-task px-6 py-12 animate-fade-in">
        <div className="mb-10 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="ui-eyebrow mb-2">
              {t('account_reviews_label')}
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">{view === 'practice' ? t('practice_journal_headline') : t('account_reviews_headline')}</h1>
          </div>
          <Link
            href="/retake"
            className="ui-action-secondary w-fit border-sage/35 px-4 py-2.5 text-sm text-sage hover:bg-sage/10"
          >
            <Repeat2 size={14} />
            {retakeCopy.historyCta}
          </Link>
        </div>

        <div className="mb-6 inline-flex rounded-lg border border-border bg-raised p-1">
          <button
            type="button"
            onClick={() => handleViewChange('reviews')}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${view === 'reviews' ? 'bg-gold text-void' : 'text-ink-muted hover:text-ink'}`}
          >
            {t('history_tab_reviews')}
          </button>
          <button
            type="button"
            onClick={() => handleViewChange('practice')}
            className={`rounded-md px-4 py-2 text-sm transition-colors ${view === 'practice' ? 'bg-gold text-void' : 'text-ink-muted hover:text-ink'}`}
          >
            {t('history_tab_practice')}
          </button>
        </div>

        {view === 'reviews' ? (
          <>
            <section className="ui-panel mb-6 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm text-ink">
                <SlidersHorizontal size={15} className="text-gold" />
                <span>{copy.filtersLabel}</span>
              </div>

              <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-[minmax(0,1.28fr)_minmax(0,1.28fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.05fr)]">
                <DateFilterField
                  label={copy.from}
                  value={draftFilters.createdFrom}
                  error={createdFromInvalid ? copy.invalidDate : undefined}
                  onChange={(value) =>
                    setDraftFilters((prev) => ({ ...prev, createdFrom: value }))
                  }
                />

                <DateFilterField
                  label={copy.to}
                  value={draftFilters.createdTo}
                  error={createdToInvalid ? copy.invalidDate : undefined}
                  onChange={(value) =>
                    setDraftFilters((prev) => ({ ...prev, createdTo: value }))
                  }
                />

                <label className="min-w-0 space-y-2 text-xs text-ink-muted">
                  <span>{copy.minScore}</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={draftFilters.minScore}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, minScore: event.target.value }))
                    }
                    className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
                  />
                </label>

                <label className="min-w-0 space-y-2 text-xs text-ink-muted">
                  <span>{copy.maxScore}</span>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    step="0.1"
                    value={draftFilters.maxScore}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, maxScore: event.target.value }))
                    }
                    className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
                  />
                </label>

                <label className="min-w-0 space-y-2 text-xs text-ink-muted">
                  <span>{copy.imageType}</span>
                  <select
                    value={draftFilters.imageType}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({
                        ...prev,
                        imageType: event.target.value as '' | ImageType,
                      }))
                    }
                    className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
                  >
                    <option value="">{copy.allTypes}</option>
                    {IMAGE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {getImageTypeLabel(locale, type)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="min-w-0 space-y-2 text-xs text-ink-muted">
                  <span>q</span>
                  <input
                    type="search"
                    maxLength={100}
                    value={draftFilters.q}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, q: event.target.value }))
                    }
                    className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
                  />
                </label>
                <label className="min-w-0 space-y-2 text-xs text-ink-muted">
                  <span>tag</span>
                  <input
                    type="search"
                    value={draftFilters.tag}
                    onChange={(event) =>
                      setDraftFilters((prev) => ({ ...prev, tag: event.target.value }))
                    }
                    className="min-h-11 w-full min-w-0 rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-gold/40"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleApplyFilters}
                  disabled={hasInvalidDate}
                  className="ui-action-primary px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {copy.apply}
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="ui-action-secondary px-4 py-2 text-sm"
                >
                  {copy.reset}
                </button>
              </div>
            </section>

            {!loading && !error && items.length > 0 && (
              <>
                <ReviewOrganizationPanel
                  item={selectedReview}
                  items={items}
                  locale={locale}
                  busy={organizationBusy}
                  status={organizationStatus}
                  onSelect={setSelectedReviewId}
                  onSave={handleSaveOrganization}
                />
                <ReviewVisibilityPanel
                  item={selectedReview}
                  locale={locale}
                  visibility={reviewVisibility}
                  busy={visibilityBusy}
                  onRefresh={refreshSelectedVisibility}
                  onCreateShare={handleCreateShare}
                  onRevokeShare={handleRevokeShare}
                  onRemoveGallery={handleRemoveGallery}
                  onStopAll={handleStopAllPublic}
                />
              </>
            )}

            {!loading && !error && items.length > 0 && (
              <RetakeProgressPanel items={items} locale={locale} />
            )}

            {!loading && !error && items.length > 0 && (
              <ReviewGrowthPanel
                growthCopy={growthCopy}
                practiceThemeCopy={practiceThemeCopy}
                growthSnapshot={growthSnapshot}
                dimensionLabels={dimensionLabels}
                locale={locale}
              />
            )}

            {!loading && !error && items.length > 0 && plan !== 'pro' && (
              <ProPromoCard
                plan={plan === 'guest' ? 'guest' : 'free'}
                scene="usage"
                title={historyPromoCopy.title}
                body={historyPromoCopy.body}
                fallbackRedirectUrl="/account/reviews"
                className="mb-6"
              />
            )}

            {loading ? (
              <ReviewHistorySkeletonList />
            ) : error ? (
              <div className="flex items-center gap-2 rounded border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
                <AlertCircle size={14} />
                {error}
              </div>
            ) : items.length === 0 ? (
              <div className="ui-panel space-y-3 px-6 py-16 text-center">
                <p className="text-sm text-ink-subtle">{t('reviews_empty')}</p>
                <Link
                  href="/workspace"
                  className="ui-action-primary px-3 py-1.5 text-xs"
                >
                  {t('reviews_empty_cta')}
                  <ChevronRight size={11} />
                </Link>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {items.map((item) => (
                    <ReviewCard key={item.review_id} item={item} />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={handleLoadMore}
                      disabled={loadingMore}
                      className="ui-action-secondary mx-auto px-5 py-2 text-sm disabled:opacity-50"
                    >
                      {loadingMore && <RefreshCw size={13} className="animate-spin" />}
                      {loadingMore ? t('reviews_loading_more') : t('reviews_load_more')}
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <>
            <PracticeSummaryPanel
              summary={practiceSummary}
              copy={{
                title: t('practice_summary_title'),
                body: t('practice_summary_body'),
                sessions: t('practice_summary_sessions'),
                attempts: t('practice_summary_attempts'),
                samples: t('practice_summary_samples'),
                indeterminate: t('practice_summary_indeterminate'),
                range: t('practice_summary_range'),
                allScope: t('practice_summary_all_scope'),
                unavailable: t('practice_summary_unavailable'),
                loading: t('practice_loading'),
                retry: t('reviews_err_retry'),
              }}
              labels={practiceLabels}
              locale={locale}
              loading={summaryLoading}
              error={summaryError}
              onRetry={handleSummaryRetry}
            />

            <section className="ui-panel mb-6 p-5">
              <div className="mb-4 flex items-center gap-2 text-sm text-ink">
                <SlidersHorizontal size={15} className="text-gold" />
                <span>{t('practice_filters_label')}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-2 text-xs text-ink-muted">
                  <span>{t('practice_filter_lifecycle')}</span>
                  <select
                    value={practiceFilters.lifecycle}
                    onChange={(event) => setPracticeFilters((prev) => ({ ...prev, lifecycle: event.target.value as PracticeFilters['lifecycle'] }))}
                    className="min-h-11 w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
                  >
                    <option value="all">{t('practice_filter_all')}</option>
                    {(['active', 'completed', 'archived'] as PracticeLifecycle[]).map((item) => (
                      <option key={item} value={item}>{practiceLabels.lifecycle[item]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-xs text-ink-muted">
                  <span>{t('practice_filter_dimension')}</span>
                  <select
                    value={practiceFilters.dimension}
                    onChange={(event) => setPracticeFilters((prev) => ({ ...prev, dimension: event.target.value as PracticeFilters['dimension'] }))}
                    className="min-h-11 w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
                  >
                    <option value="all">{t('practice_filter_all')}</option>
                    {PRACTICE_DIMENSIONS.map((item) => (
                      <option key={item} value={item}>{dimensionLabels[item]}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-xs text-ink-muted">
                  <span>{t('practice_filter_kind')}</span>
                  <select
                    value={practiceFilters.practiceKind}
                    onChange={(event) => setPracticeFilters((prev) => ({ ...prev, practiceKind: event.target.value as PracticeFilters['practiceKind'] }))}
                    className="min-h-11 w-full rounded-control border border-border bg-void/60 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold/40"
                  >
                    <option value="all">{t('practice_filter_all')}</option>
                    {PRACTICE_KINDS.map((item) => (
                      <option key={item} value={item}>{practiceLabels.kind[item]}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {practiceLoading ? (
              <PracticeJournalLoading label={t('practice_loading')} />
            ) : practiceError ? (
              <div className="flex items-center justify-between gap-3 rounded border border-rust/20 bg-rust/5 px-4 py-3 text-sm text-rust">
                <span className="inline-flex items-center gap-2"><AlertCircle size={14} />{practiceError}</span>
                <button type="button" onClick={handlePracticeRetry} className="ui-action-secondary px-3 py-1.5 text-xs">
                  {t('reviews_err_retry')}
                </button>
              </div>
            ) : practiceItems.length === 0 ? (
              <PracticeJournalEmpty copy={{ title: t('practice_empty_title'), body: t('practice_empty_body') }} />
            ) : (
              <>
                <p className="mb-3 text-xs text-ink-subtle">
                  {t('practice_page_count').replace('{count}', String(practiceItems.length))}
                </p>
                <div className="space-y-3">
                  {practiceItems.map((item) => (
                    <div key={item.session_id}>
                      <PracticeSessionCard
                        item={item}
                        copy={{
                          attempts: t('practice_card_attempts'),
                          latest: t('practice_card_latest'),
                          continue: t('practice_continue'),
                          viewDetail: t('practice_view_detail'),
                          readonly: t('practice_readonly'),
                          archive: t('practice_archive'),
                          restore: t('practice_restore'),
                          complete: t('practice_complete'),
                        }}
                        labels={practiceLabels}
                        dimensionLabel={(dimension) => dimensionLabels[dimension]}
                        genreLabel={(genre) => formatPracticeGenre(locale, genre)}
                        locale={locale}
                        selected={selectedSessionId === item.session_id}
                        busyLifecycle={lifecycleBusyId === item.session_id}
                        onSelect={() => setSelectedSessionId(item.session_id)}
                        onLifecycle={(lifecycle) => handleLifecycle(item.session_id, lifecycle)}
                      />
                      {selectedSessionId === item.session_id && (
                        selectedLoading ? (
                          <div className="mt-3 rounded-lg border border-border-subtle bg-raised/70 px-4 py-3 text-sm text-ink-muted">
                            {t('practice_loading')}
                          </div>
                        ) : (
                          <PracticeSessionDetail
                            session={selectedSession}
                            copy={{
                              detailTitle: t('practice_detail_title'),
                              criteria: t('practice_detail_criteria'),
                              timeline: t('practice_detail_timeline'),
                              noAttempts: t('practice_detail_no_attempts'),
                              task: t('practice_detail_task'),
                              review: t('practice_detail_review'),
                              error: t('practice_detail_error'),
                              retry: t('reviews_err_retry'),
                            }}
                            labels={practiceLabels}
                            locale={locale}
                            loading={selectedLoading}
                            error={selectedError}
                            onRetry={handleDetailRetry}
                          />
                        )
                      )}
                    </div>
                  ))}
                </div>

                {practiceHasMore && (
                  <div className="mt-8 text-center">
                    <button
                      onClick={handlePracticeLoadMore}
                      disabled={practiceLoadingMore}
                      className="ui-action-secondary mx-auto px-5 py-2 text-sm disabled:opacity-50"
                    >
                      {practiceLoadingMore && <RefreshCw size={13} className="animate-spin" />}
                      {practiceLoadingMore ? t('reviews_loading_more') : t('reviews_load_more')}
                    </button>
                  </div>
                )}
              </>
            )}
            <LegacyRetakeList
              items={legacyRetakes}
              copy={{
                title: t('practice_legacy_title'),
                body: t('practice_legacy_body'),
                empty: t('practice_legacy_empty'),
                loading: t('practice_legacy_loading'),
                retry: t('reviews_err_retry'),
                loadMore: t('reviews_load_more'),
                loadingMore: t('reviews_loading_more'),
              }}
              locale={locale}
              loading={legacyLoading}
              error={legacyError}
              hasMore={legacyHasMore}
              loadingMore={legacyLoadingMore}
              onRetry={handleLegacyRetry}
              onLoadMore={handleLegacyLoadMore}
            />
          </>
        )}
      </div>
    </div>
  );
}
