'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Share2 } from 'lucide-react';
import { getPublicReview } from '@/lib/api';
import { ApiException, type ReviewGetResponse } from '@/lib/types';
import { SkeletonBlock } from '@/components/ui/LoadingSpinner';
import { useI18n } from '@/lib/i18n';
import { formatUserFacingError } from '@/lib/error-utils';
import { markProductAttributionSource } from '@/lib/product-analytics';

function getSharePageCopy(locale: 'zh' | 'en' | 'ja') {
  if (locale === 'ja') {
    return {
      label: 'Shared Review',
      title: '共有された評価結果',
      openWorkspace: '自分の写真を評価する',
      unavailableTitle: '共有リンクは無効です',
      unavailableBody: 'この共有リンクは期限切れ、または所有者によって取り消されました。元の評価結果は表示できません。',
      errorTitle: '共有結果を読み込めません',
    };
  }

  if (locale === 'en') {
    return {
      label: 'Shared Review',
      title: 'Shared Critique Result',
      openWorkspace: 'Critique your own photo',
      unavailableTitle: 'This share link is no longer available',
      unavailableBody: 'This share link has expired or was revoked by the owner. The original critique cannot be viewed from this link.',
      errorTitle: 'Unable to load this shared result',
    };
  }

  return {
    label: '分享结果',
    title: '公开评图结果',
    openWorkspace: '去评自己的照片',
    unavailableTitle: '分享链接已失效',
    unavailableBody: '这个分享链接已过期或已被所有者撤销，不能继续查看原点评。',
    errorTitle: '无法加载分享结果',
  };
}

export default function SharedReviewPage() {
  const params = useParams();
  const { locale, t } = useI18n();
  const copy = getSharePageCopy(locale);
  const shareToken = params.shareToken as string;

  const [review, setReview] = useState<ReviewGetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPublicReview(shareToken)
      .then((data) => {
        if (cancelled) return;
        setReview(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiException && err.status === 404) {
          setError({ title: copy.unavailableTitle, body: copy.unavailableBody });
        } else {
          setError({ title: copy.errorTitle, body: formatUserFacingError(t, err, t('review_err_fetch')) });
        }
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [copy.errorTitle, copy.unavailableBody, copy.unavailableTitle, shareToken, t]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <SkeletonBlock className="mb-8 h-8 w-52" />
          <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
            <SkeletonBlock className="h-[420px] w-full rounded-xl" />
            <div className="space-y-4">
              <SkeletonBlock className="h-10 w-64" />
              <SkeletonBlock className="h-24 w-full rounded-xl" />
              <SkeletonBlock className="h-24 w-full rounded-xl" />
              <SkeletonBlock className="h-24 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !review) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="space-y-4 text-center">
          <AlertCircle size={40} className="mx-auto text-rust" />
          <div>
            <h1 className="text-2xl font-semibold text-ink">{error?.title ?? copy.errorTitle}</h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-rust">{error?.body ?? t('review_err_fetch')}</p>
          </div>
          <Link
            href="/workspace"
            onClick={() => markProductAttributionSource('share')}
            className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
          >
            {copy.openWorkspace}
            <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    );
  }

  const result = review.result;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-5xl px-6 py-12 animate-fade-in">
        <div className="mb-8">
          <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/10 px-3 py-1 text-[11px] uppercase tracking-[0.26em] text-gold/80">
            <Share2 size={12} />
            {copy.label}
          </p>
          <h1 className="font-display text-4xl text-ink sm:text-5xl">{copy.title}</h1>
        </div>

        <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
          <div className="overflow-hidden rounded-xl border border-border-subtle bg-raised">
            {review.photo_url ? (
              <div className="relative aspect-[4/3]">
                <Image
                  src={review.photo_url}
                  alt={t('review_photo_alt')}
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            ) : (
              <div className="flex h-80 items-center justify-center text-sm text-ink-subtle">
                {t('review_no_image')}
              </div>
            )}
            <div className="border-t border-border-subtle px-5 py-4">
              <p className="text-xs text-ink-subtle">{t('demo_final_score')}</p>
              <p className="mt-2 font-display text-5xl text-gold">{result.final_score.toFixed(1)}</p>
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-sage/20 bg-sage/5 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.26em] text-sage/80">{t('review_advantage')}</p>
              <p className="mt-3 text-sm leading-7 text-ink">{result.advantage}</p>
            </section>

            <section className="rounded-xl border border-rust/20 bg-rust/5 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.26em] text-rust/80">{t('review_critique')}</p>
              <p className="mt-3 text-sm leading-7 text-ink">{result.critique}</p>
            </section>

            <section className="rounded-xl border border-gold/20 bg-gold/5 px-5 py-4">
              <p className="text-xs uppercase tracking-[0.26em] text-gold/80">{t('review_suggestions')}</p>
              <p className="mt-3 text-sm leading-7 text-ink">{result.suggestions}</p>
            </section>

            <div className="pt-2">
              <Link
                href="/workspace"
                onClick={() => markProductAttributionSource('share')}
                className="inline-flex items-center gap-2 rounded-full bg-gold px-4 py-2 text-sm font-medium text-void transition-colors hover:bg-gold-light"
              >
                {copy.openWorkspace}
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
