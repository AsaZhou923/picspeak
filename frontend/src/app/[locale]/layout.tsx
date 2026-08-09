import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { HOME_LANGUAGE_ALTERNATES } from '@/lib/seo';
import { VALID_LOCALES } from './locales';

export const dynamicParams = false;

// ---------------------------------------------------------------------------
// Per-locale SEO data
// ---------------------------------------------------------------------------

const LOCALE_META: Record<
  Locale,
  {
    lang: string;
    ogLocale: string;
    title: string;
    description: string;
    keywords: string[];
    ogImageAlt: string;
  }
> = {
  zh: {
    lang: 'zh-CN',
    ogLocale: 'zh_CN',
    title: 'AI 摄影点评与照片分析',
    description:
      '上传照片，AI 即刻从构图、光线、色彩、表达与技术五维度打分并给出改进建议。免费试用，无需注册，秒级出结果。适合摄影爱好者、学生和创作者快速提升拍摄水平。',
    keywords: [
      'AI摄影点评',
      '照片分析',
      'AI照片反馈',
      '摄影点评',
      '照片点评',
      '构图分析',
      '光线分析',
      '摄影技巧',
      '摄影评分',
      'AI摄影助手',
      '照片评分',
      '摄影学习',
      '专业摄影反馈',
      '在线照片点评',
      '摄影入门',
      '照片改进建议',
      'AI评图',
      '摄影教学',
      '照片构图技巧',
      '摄影提分',
      '免费照片点评',
      '照片点评工具',
      '摄影练习',
    ],
    ogImageAlt: 'PicSpeak — AI 摄影点评与照片评分工具',
  },
  en: {
    lang: 'en',
    ogLocale: 'en_US',
    // Lead with the highest-volume head term before the brand name
    title: 'AI Photo Critique and Photography Feedback',
    description:
      'Free AI photo critique across composition, lighting, color, impact, and technique. Get practical photography feedback in seconds with no sign-up required.',
    keywords: [
      'AI photo critique',
      'AI photography feedback',
      'photo analysis tool',
      'photography critique online',
      'AI photo review',
      'composition feedback',
      'lighting analysis',
      'photo scoring',
      'improve photography skills',
      'photo critique app',
      'photography improvement tool',
      'AI image analysis',
      'photo feedback online',
      'photography tips AI',
      'professional photo review',
      'photo critique free',
      'free photo critique',
      'online photo review tool',
      'AI photography coach',
      'photo composition checker',
      'photography learning tool',
      'image critique AI',
    ],
    ogImageAlt: 'PicSpeak — Free AI Photo Critique & Photography Feedback',
  },
  ja: {
    lang: 'ja',
    ogLocale: 'ja_JP',
    // Lead with core Japanese search terms
    title: 'AI写真講評・採点と写真フィードバック',
    description:
      '写真をアップするだけで、AIが構図・光・色彩・インパクト・技術の5項目を即座に採点・批評。登録不要・無料で今すぐ試せる、写真上達のためのAIフィードバックツール。',
    keywords: [
      'AI写真批評',
      '写真フィードバック',
      'AI写真分析',
      '写真添削',
      '構図分析',
      '撮影技術向上',
      '写真採点',
      'AI写真診断',
      '写真上達',
      '写真評価ツール',
      'プロ写真アドバイス',
      '写真スキルアップ',
      'カメラ上達 AI',
      '写真批評アプリ',
      '写真フィードバック無料',
      '無料写真批評',
      '写真添削無料',
      '写真採点アプリ',
      'AIカメラアドバイス',
      '写真批評オンライン',
      'カメラ初心者 上達',
      '写真構図 チェック',
    ],
    ogImageAlt: 'PicSpeak — AI写真批評・無料写真フィードバック',
  },
};

// ---------------------------------------------------------------------------
// Next.js route handlers
// ---------------------------------------------------------------------------

type Props = {
  params: Promise<{ locale: string }>;
  children: React.ReactNode;
};

export async function generateStaticParams() {
  return VALID_LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!VALID_LOCALES.includes(locale as Locale)) {
    notFound();
  }

  const meta = LOCALE_META[locale as Locale];

  return {
    metadataBase: new URL(siteConfig.url),
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    applicationName: siteConfig.name,
    authors: [{ name: 'PicSpeak' }],
    creator: 'PicSpeak',
    publisher: 'PicSpeak',
    category: 'photography',
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
        'max-snippet': -1,
        'max-video-preview': -1,
      },
    },
    alternates: {
      canonical: `/${locale}`,
      languages: HOME_LANGUAGE_ALTERNATES,
    },
    openGraph: {
      type: 'website',
      url: `${siteConfig.url}/${locale}`,
      siteName: siteConfig.name,
      title: meta.title,
      description: meta.description,
      locale: meta.ogLocale,
      images: [
        {
          url: siteConfig.ogImage,
          width: siteConfig.ogImageWidth,
          height: siteConfig.ogImageHeight,
          alt: meta.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.description,
      images: [siteConfig.ogImage],
      creator: '@Zzw_Prime',
    },
  };
}

export default async function LocaleLayout({ params, children }: Props) {
  const { locale } = await params;

  if (!VALID_LOCALES.includes(locale as Locale)) {
    notFound();
  }

  return children;
}
