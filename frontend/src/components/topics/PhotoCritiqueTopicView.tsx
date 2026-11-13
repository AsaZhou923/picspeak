'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ImageOff, ScanSearch } from 'lucide-react';
import {
  getPhotoCritiqueTopicCopy,
  getPhotoCritiqueTopicPath,
  type PhotoCritiqueTopic,
  type PhotoCritiqueTopicDimension,
  type PhotoCritiqueTopicLocale,
} from '@/content/topics/photo-critique-topics';
import { buildWorkspaceConversionHref } from '@/lib/content-conversion';
import { DEMO_REVIEW_ID } from '@/lib/demo-review';
import { buildGalleryTypeFilterHref, formatGalleryScore, galleryReviewPath } from '@/lib/gallery-review-page';
import type { GalleryTopicSample } from '@/lib/gallery-review-server';
import { useI18n } from '@/lib/i18n';
import { markProductAttributionSource, trackProductEvent } from '@/lib/product-analytics';

const DIMENSIONS: PhotoCritiqueTopicDimension[] = ['composition', 'lighting', 'color', 'impact', 'technical'];

type RelatedPost = { slug: string; title: string };

type Props = {
  topic: PhotoCritiqueTopic;
  samples: GalleryTopicSample[];
  relatedPosts: Record<PhotoCritiqueTopicLocale, RelatedPost[]>;
};

export default function PhotoCritiqueTopicView({ topic, samples, relatedPosts }: Props) {
  const { locale } = useI18n();
  const contentLocale: PhotoCritiqueTopicLocale = locale === 'zh' || locale === 'ja' ? locale : 'en';
  const copy = getPhotoCritiqueTopicCopy(topic, contentLocale);
  const pagePath = getPhotoCritiqueTopicPath(topic.slug);
  const workspaceHref = buildWorkspaceConversionHref({
    source: 'topic_landing',
    entrypoint: 'topic_landing',
    imageType: topic.imageType,
    contentSlug: topic.slug,
  });
  const related = relatedPosts[contentLocale] ?? [];

  const handleWorkspaceClick = (placement: 'hero' | 'footer') => {
    markProductAttributionSource('topic_landing');
    void trackProductEvent('content_workspace_clicked', {
      source: 'topic_landing',
      pagePath,
      locale,
      metadata: { entrypoint: 'topic_landing', content_slug: topic.slug, image_type: topic.imageType, placement },
    });
  };

  return (
    <div className="min-h-screen" lang={contentLocale}>
      <section className="border-b border-border-subtle px-5 py-14 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-workspace">
          <span className="inline-flex items-center gap-2 rounded-full border border-sage/30 bg-sage/10 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.2em] text-sage">
            <ScanSearch size={13} aria-hidden="true" />
            {copy.eyebrow}
          </span>
          <h1 className="mt-7 max-w-3xl text-balance font-display text-4xl leading-[1.04] text-ink sm:text-6xl">{copy.title}</h1>
          <p className="mt-6 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">{copy.intro}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href={workspaceHref} onClick={() => handleWorkspaceClick('hero')} className="ui-action-primary min-h-11 px-5 py-3 text-sm">
              {copy.ctaPrimary}
              <ArrowRight size={13} aria-hidden="true" />
            </Link>
            <Link href={buildGalleryTypeFilterHref(topic.imageType)} className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted transition-colors hover:text-gold">
              {copy.samplesAll}
            </Link>
          </div>
        </div>
      </section>

      <section className="px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-workspace">
          <h2 className="text-3xl font-semibold text-ink">{copy.checksTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{copy.checksIntro}</p>
          <dl className="mt-8 grid gap-px overflow-hidden rounded-feature border border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-5">
            {DIMENSIONS.map((dimension) => (
              <div key={dimension} className="bg-surface px-5 py-5">
                <dt className="text-sm font-semibold text-ink">{copy.dimensions[dimension].label}</dt>
                <dd className="mt-2 text-sm leading-6 text-ink-muted">{copy.dimensions[dimension].body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-border-subtle px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-workspace">
          <h2 className="text-3xl font-semibold text-ink">{copy.samplesTitle}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted">{copy.samplesBody}</p>
          {samples.length > 0 ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {samples.map((sample) => (
                <li key={sample.review_id}>
                  <Link
                    href={galleryReviewPath(sample.review_id)}
                    className="group block overflow-hidden rounded-feature border border-border-subtle bg-raised/65 shadow-level-1 transition-all duration-300 hover:-translate-y-1 hover:border-sage/45"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-void/50">
                      {sample.photo_thumbnail_url ? (
                        <Image
                          src={sample.photo_thumbnail_url}
                          alt={copy.samplesTitle}
                          fill
                          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw"
                          className="object-cover"
                          unoptimized
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-ink-subtle">
                          <ImageOff size={24} aria-hidden="true" />
                        </div>
                      )}
                      <span className="absolute bottom-3 left-3 font-display text-3xl leading-none text-white drop-shadow">
                        {formatGalleryScore(sample.final_score)}
                      </span>
                    </div>
                    {sample.summary && <p className="line-clamp-3 p-4 text-sm leading-6 text-ink-muted">{sample.summary}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-8 text-sm text-ink-muted">
              {copy.samplesEmpty}{' '}
              <Link href={`/reviews/${DEMO_REVIEW_ID}`} className="font-semibold text-ink transition-colors hover:text-gold">
                {copy.samplesExample}
              </Link>
            </p>
          )}
        </div>
      </section>

      <section className="border-t border-border-subtle px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-workspace gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-ink">{copy.issuesTitle}</h2>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-ink-muted">
              {copy.issues.map((issue) => (
                <li key={issue} className="border-l-2 border-gold/40 pl-4">{issue}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-ink">{copy.workflowTitle}</h2>
            <ol className="mt-5 space-y-3 text-sm leading-7 text-ink-muted">
              {copy.workflow.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="font-mono text-xs text-sage">0{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="border-t border-border-subtle px-5 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto grid max-w-workspace gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-ink">{copy.limitsTitle}</h2>
            <ul className="mt-5 space-y-3 text-sm leading-7 text-ink-muted">
              {copy.limits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-ink">{copy.faqTitle}</h2>
            <dl className="mt-5 space-y-5">
              {copy.faq.map((entry) => (
                <div key={entry.question}>
                  <dt className="text-sm font-semibold text-ink">{entry.question}</dt>
                  <dd className="mt-1 text-sm leading-7 text-ink-muted">{entry.answer}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section className="border-t border-border-subtle bg-surface/35 px-5 py-12 sm:px-6">
        <div className="mx-auto flex max-w-workspace flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl text-ink">{copy.ctaTitle}</h2>
            <p className="mt-2 text-sm leading-7 text-ink-muted">{copy.ctaBody}</p>
          </div>
          <Link href={workspaceHref} onClick={() => handleWorkspaceClick('footer')} className="ui-action-primary min-h-11 w-fit px-5 py-3 text-sm">
            {copy.ctaPrimary}
            <ArrowRight size={13} aria-hidden="true" />
          </Link>
        </div>
        {related.length > 0 && (
          <div className="mx-auto mt-8 max-w-workspace">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-ink-subtle">{copy.relatedTitle}</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {related.map((post) => (
                <li key={post.slug}>
                  <Link href={`/${contentLocale}/blog/${post.slug}`} className="text-ink-muted transition-colors hover:text-gold">
                    {post.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
