import type { Metadata } from 'next';
import { buildDemoReviewJsonLd, DEMO_REVIEW_ID, isDemoReviewId } from '@/lib/demo-review';
import { enTranslations } from '@/lib/i18n-en';
import { INDEXABLE_ROBOTS, NO_INDEX_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

export async function generateMetadata(
  { params }: { params: Promise<{ reviewId: string }> }
): Promise<Metadata> {
  const { reviewId } = await params;
  const isDemoReview = isDemoReviewId(reviewId);

  return {
    title: isDemoReview
      ? 'AI Photo Critique Example | AI摄影点评示例 | AI写真批評例 — PicSpeak'
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

  return (
    <>
      {demoReviewJsonLd && (
        <script
          id="picspeak-demo-review-structured-data"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(demoReviewJsonLd) }}
        />
      )}
      {children}
    </>
  );
}
