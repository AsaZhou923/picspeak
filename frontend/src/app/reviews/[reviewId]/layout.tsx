import type { Metadata } from 'next';
import Link from 'next/link';
import { buildDemoReviewJsonLd, DEMO_REVIEW_ID, isDemoReviewId } from '@/lib/demo-review';
import { enTranslations } from '@/lib/i18n-en';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS, NO_INDEX_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export async function generateMetadata(
  { params }: { params: Promise<{ reviewId: string }> }
): Promise<Metadata> {
  const { reviewId } = await params;
  const isDemoReview = isDemoReviewId(reviewId);

  return {
    title: isDemoReview
      ? 'AI Photo Critique Example'
      : 'Private AI Photo Critique Result with Detailed Feedback',
    description: isDemoReview
      ? 'Public PicSpeak example: composition, lighting, color, impact & technique scores with suggestions. 公开评图示例：构图、光线、色彩、表达与技术评分与改进建议。AI写真批評の公開例 — 構図・光・色彩の採点と改善提案。'
      : 'Open your PicSpeak critique result to inspect scores, strengths, weaknesses, and concrete next-step suggestions for the photo.',
    keywords: isDemoReview
      ? [
          'AI photo critique example',
          'photo review sample',
          'composition scoring',
          'AI摄影点评示例',
          '照片评分示例',
          '构图评分',
          'AI写真批評例',
          '写真採点サンプル',
          '構図採点',
        ]
      : undefined,
    alternates: isDemoReview
      ? singlePageAlternates(`/reviews/${DEMO_REVIEW_ID}`)
      : undefined,
    robots: isDemoReview ? INDEXABLE_ROBOTS : NO_INDEX_ROBOTS,
  };
}

export default async function ReviewDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ reviewId: string }>;
}) {
  const { reviewId } = await params;
  const demoReviewJsonLd = isDemoReviewId(reviewId)
    ? buildDemoReviewJsonLd({
        site: siteConfig,
        reviewId,
        title: 'AI Photo Critique Example',
        description:
          'Public PicSpeak example with composition, lighting, color, impact, and technique scores plus practical next-shoot suggestions.',
        locale: 'en',
        imageAlt: enTranslations.demo_image_alt,
        advantage: enTranslations.demo_review_advantage,
        critique: enTranslations.demo_review_critique,
        suggestions: enTranslations.demo_review_suggestions,
      })
    : null;
  const demoBreadcrumbJsonLd = demoReviewJsonLd
    ? buildPublicBreadcrumbJsonLd({
        site: siteConfig,
        items: [
          { name: siteConfig.name, path: '/en' },
          { name: 'Gallery', path: '/gallery' },
          { name: 'AI Photo Critique Example', path: `/reviews/${reviewId}` },
        ],
      })
    : null;

  return (
    <>
      {demoReviewJsonLd && (
        <script
          id="picspeak-demo-review-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(demoReviewJsonLd) }}
        />
      )}
      {demoBreadcrumbJsonLd && (
        <script
          id="picspeak-demo-review-breadcrumb-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(demoBreadcrumbJsonLd) }}
        />
      )}
      {demoReviewJsonLd && (
        <section className="border-b border-border-subtle px-6 py-10">
          <div className="mx-auto max-w-workspace">
            <p className="ui-eyebrow">Public AI photo critique example</p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl leading-tight text-ink sm:text-5xl">
              AI Photo Critique Example: Scores, Evidence, and Retake Guidance
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted sm:text-base">
              See how PicSpeak evaluates composition, lighting, color, impact, and technique, then turns the
              weakest dimension into a concrete next-shoot action. This public example is a product walkthrough,
              not a private user result.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/gallery" className="ui-action-secondary px-5 py-2.5">
                Browse critique examples
              </Link>
              <Link href="/retake" className="ui-action-secondary px-5 py-2.5">
                Open Retake Coach
              </Link>
            </div>
          </div>
        </section>
      )}
      {children}
    </>
  );
}
