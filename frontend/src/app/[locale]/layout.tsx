import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { siteConfig } from '@/lib/site';
import type { Locale } from '@/lib/i18n';
import { VALID_LOCALES } from './locales';

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
    title: 'AI 摄影点评 · 照片评分 · 构图光线分析 — PicSpeak',
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
    title: 'AI Photo Critique & Feedback · Free Online Photography Review — PicSpeak',
    description:
      'Free AI photo critique across composition, lighting, color, impact and technique. Get professional-grade photography feedback in seconds — no sign-up required, start improving today.',
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
    title: 'AI写真批評・採点 · 無料写真フィードバック — PicSpeak',
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
// JSON-LD structured data helpers
// ---------------------------------------------------------------------------

function buildSoftwareJsonLd(locale: Locale) {
  const meta = LOCALE_META[locale];
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    applicationCategory: 'PhotographyApplication',
    operatingSystem: 'Web',
    url: `${siteConfig.url}/${locale}`,
    inLanguage: meta.lang,
    description: meta.description,
    image: `${siteConfig.url}${siteConfig.ogImage}`,
    sameAs: [siteConfig.social.x, siteConfig.repositoryUrl],
    isAccessibleForFree: true,
    creator: {
      '@id': siteConfig.author.id,
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList:
      locale === 'ja'
        ? ['構図分析', '光の評価', '色彩診断', 'インパクト採点', '技術評価', 'AIフィードバック']
        : locale === 'zh'
          ? ['构图分析', '光线评估', '色彩诊断', '表达力评分', '技术评估', 'AI反馈']
          : [
              'Composition Analysis',
              'Lighting Evaluation',
              'Color Grading Review',
              'Impact Scoring',
              'Technical Assessment',
              'AI Feedback',
            ],
  };
}

function buildWebSiteJsonLd(locale: Locale) {
  const meta = LOCALE_META[locale];
  const localePath = `${siteConfig.url}/${locale}`;

  const potentialActionByLocale: Record<Locale, string> = {
    zh: '搜索照片',
    en: 'Search photo critiques',
    ja: '写真を検索',
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: siteConfig.name,
    url: localePath,
    inLanguage: meta.lang,
    description: meta.description,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${siteConfig.url}/gallery?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
      name: potentialActionByLocale[locale],
    },
  };
}

// FAQ structured data — rich results for "AI摄影点评" queries
function buildFAQJsonLd(locale: Locale) {
  const faqByLocale: Record<Locale, { question: string; answer: string }[]> = {
    zh: [
      {
        question: 'PicSpeak 是什么？',
        answer:
          'PicSpeak 是一款 AI 摄影点评工具，上传照片后 AI 从构图、光线、色彩、表达与技术五个维度给出评分和改进建议，帮助摄影爱好者快速提升拍摄水平。',
      },
      {
        question: 'AI 照片点评准确吗？',
        answer:
          'PicSpeak 使用专业摄影维度的评分体系（构图、光线、色彩、表达、技术），每个维度独立打分并给出具体优缺分析和改进建议，适合作为学习和改进参考。',
      },
      {
        question: 'PicSpeak 免费吗？',
        answer:
          '游客无需注册即可每天免费点评 3 张照片（每月 30 次）。登录后 Free 账户每月 60 次，Pro 账户不限次数、永久保留历史并优先处理。',
      },
      {
        question: '支持哪些图片格式？',
        answer: '目前支持 JPG、PNG 和 WebP 格式，文件大小上限 20 MB，上传后系统会自动压缩。',
      },
      {
        question: '照片点评结果会保存吗？',
        answer:
          '游客结果不保存；Free 用户保留 30 天；Pro 用户永久保留所有点评历史，可随时回顾每张照片的进步轨迹。',
      },
    ],
    en: [
      {
        question: 'What is PicSpeak?',
        answer:
          'PicSpeak is an AI photo critique tool that scores your photos across composition, lighting, color, impact, and technique, and provides actionable improvement suggestions to help you improve your photography.',
      },
      {
        question: 'Is PicSpeak free?',
        answer:
          'Guests can critique 3 photos per day (30/month) for free with no sign-up. Free accounts get 60/month, and Pro accounts have unlimited critiques with permanent history and priority processing.',
      },
      {
        question: 'What image formats does PicSpeak support?',
        answer:
          'PicSpeak supports JPG, PNG, and WebP formats, up to 20 MB per file. Images are automatically compressed on upload — no manual resizing needed.',
      },
      {
        question: 'How does AI photo critique work?',
        answer:
          'Upload a photo and PicSpeak\'s AI evaluates five dimensions: composition, lighting, color, impact, and technique. Each dimension receives an individual score along with written analysis and concrete improvement suggestions.',
      },
      {
        question: 'Are my uploaded photos kept private?',
        answer:
          'Uploaded photos are used only for AI analysis and are never shared publicly with other users. Guest analysis results are not retained long-term, and all storage is encrypted.',
      },
    ],
    ja: [
      {
        question: 'PicSpeakとは？',
        answer:
          'PicSpeakはAI写真批評ツールで、構図・光・色彩・インパクト・技術の5項目で採点し、具体的な改善提案を出力します。写真上達を目指す方に最適です。',
      },
      {
        question: '無料で使えますか？',
        answer:
          'ゲストは登録不要で毎日3枚（月30枚）無料。Freeアカウントは月60枚、Proは無制限で履歴も永久保存・優先処理付き。',
      },
      {
        question: '対応画像形式は？',
        answer:
          'JPG・PNG・WebP形式に対応、1ファイル最大20MB。アップロード時に自動圧縮されるため、手動リサイズは不要です。',
      },
      {
        question: 'アップロードした写真は安全？',
        answer:
          'アップロードされた写真はAI分析のみに使用し、他のユーザーに公開されることはありません。暗号化ストレージで保管され、ゲストの分析結果は長期保存されません。',
      },
      {
        question: '批評結果はどれくらい保存される？',
        answer:
          'ゲストの結果は保存されません。Freeは30日間、Proは全履歴を永久保存。いつでも各写真の成長を振り返れます。',
      },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqByLocale[locale].map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  };
}

// BreadcrumbList structured data for navigation cue
function buildBreadcrumbJsonLd(locale: Locale) {
  const homeName: Record<Locale, string> = {
    zh: '首页',
    en: 'Home',
    ja: 'ホーム',
  };

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: homeName[locale],
        item: `${siteConfig.url}/${locale}`,
      },
    ],
  };
}

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
  if (!VALID_LOCALES.includes(locale as Locale)) return {};

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
      languages: {
        'zh-CN': '/zh',
        en: '/en',
        ja: '/ja',
        'x-default': '/',
      },
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
          width: 512,
          height: 512,
          alt: meta.ogImageAlt,
        },
      ],
    },
    twitter: {
      card: 'summary',
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

  const typedLocale = locale as Locale;

  // No extra DOM wrappers — the root layout already renders <html> and <body>.
  // Inject JSON-LD here so it appears in the <head> for this route segment.
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildSoftwareJsonLd(typedLocale)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildWebSiteJsonLd(typedLocale)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildFAQJsonLd(typedLocale)),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildBreadcrumbJsonLd(typedLocale)),
        }}
      />
      {children}
    </>
  );
}
