import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { buildDemoReviewJsonLd, DEMO_REVIEW_ID, isDemoReviewId } from '@/lib/demo-review';
import type { Locale } from '@/lib/i18n';
import { enTranslations } from '@/lib/i18n-en';
import { serializeJsonLd } from '@/lib/json-ld';
import { isSupportedLocale } from '@/lib/locale';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS, NO_INDEX_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const DEMO_HERO_COPY: Record<Locale, {
  eyebrow: string;
  title: string;
  body: string;
  galleryCta: string;
  retakeCta: string;
}> = {
  en: {
    eyebrow: 'Public AI photo critique example',
    title: 'AI Photo Critique Example: Scores, Evidence, and Retake Guidance',
    body:
      'See how PicSpeak evaluates composition, lighting, color, impact, and technique, then turns the weakest dimension into a concrete next-shoot action. This public example is a product walkthrough, not a private user result.',
    galleryCta: 'Browse critique examples',
    retakeCta: 'Open Retake Coach',
  },
  zh: {
    eyebrow: '公开 AI 摄影点评示例',
    title: 'AI 摄影点评示例：评分、依据与复拍建议',
    body:
      '查看 PicSpeak 如何评估构图、光线、色彩、表达和技术质量，并把最弱维度转化为下一次拍摄可执行的行动。这个公开示例是产品演示，不是私人用户结果。',
    galleryCta: '浏览点评示例',
    retakeCta: '打开复拍教练',
  },
  ja: {
    eyebrow: '公開 AI 写真批評サンプル',
    title: 'AI 写真批評サンプル：スコア、根拠、撮り直しガイド',
    body:
      'PicSpeak が構図、光、色、印象、技術をどう評価し、最も弱い要素を次の撮影アクションへ変えるかを確認できます。この公開例は製品ウォークスルーであり、非公開ユーザー結果ではありません。',
    galleryCta: '批評例を見る',
    retakeCta: 'Retake Coach を開く',
  },
};

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-picspeak-locale');
  return isSupportedLocale(locale) ? locale : 'en';
}

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
  const locale = await getRequestLocale();
  const demoHeroCopy = DEMO_HERO_COPY[locale];
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
            <p className="ui-eyebrow">{demoHeroCopy.eyebrow}</p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl leading-tight text-ink sm:text-5xl">
              {demoHeroCopy.title}
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted sm:text-base">
              {demoHeroCopy.body}
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/gallery" className="ui-action-secondary px-5 py-2.5">
                {demoHeroCopy.galleryCta}
              </Link>
              <Link href="/retake" className="ui-action-secondary px-5 py-2.5">
                {demoHeroCopy.retakeCta}
              </Link>
            </div>
          </div>
        </section>
      )}
      {children}
    </>
  );
}
