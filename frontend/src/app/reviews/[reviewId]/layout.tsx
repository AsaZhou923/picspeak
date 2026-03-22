import type { Metadata } from 'next';
import { DEMO_REVIEW_ID, isDemoReviewId } from '@/lib/demo-review';
import { INDEXABLE_ROBOTS, NO_INDEX_ROBOTS } from '@/lib/seo';

export async function generateMetadata(
  { params }: { params: Promise<{ reviewId: string }> }
): Promise<Metadata> {
  const { reviewId } = await params;
  const isDemoReview = isDemoReviewId(reviewId);

  return {
    title: isDemoReview
      ? 'AI Photo Critique Example with Scores, Feedback, and Suggestions'
      : 'Private AI Photo Critique Result with Detailed Feedback',
    description: isDemoReview
      ? 'Review a public PicSpeak example critique with category scores, written analysis, and practical suggestions for improving a photograph.'
      : 'Open your PicSpeak critique result to inspect scores, strengths, weaknesses, and concrete next-step suggestions for the photo.',
    alternates: isDemoReview
      ? {
          canonical: `/reviews/${DEMO_REVIEW_ID}`,
        }
      : undefined,
    robots: isDemoReview ? INDEXABLE_ROBOTS : NO_INDEX_ROBOTS,
  };
}

export default function ReviewDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
