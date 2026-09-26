import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { serializeJsonLd } from '@/lib/json-ld';
import type { Locale } from '@/lib/i18n';
import { isSupportedLocale } from '@/lib/locale';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const POLICY_PATH = '/editorial-policy';
const POLICY_URL = `${siteConfig.url}${POLICY_PATH}`;
const title = 'Editorial and Corrections Policy';
const description =
  'How PicSpeak reviews educational and product content, handles corrections, discloses AI assistance, documents sources, and manages sponsorship or conflicts.';

type PolicySection = {
  title: string;
  body: string;
};

type PolicyCopy = {
  eyebrow: string;
  title: string;
  description: string;
  lastReviewed: string;
  authorProfile: string;
  contactEditorial: string;
  sections: readonly PolicySection[];
};

const policySections: readonly PolicySection[] = [
  {
    title: 'Editorial Review',
    body:
      'PicSpeak content is written or edited by Asa Zhou for photographers and creators who use AI critique as a repeatable learning loop. Product pages, Lens Notes summaries, prompt-library descriptions, and AI-facing markdown mirrors are checked for consistency with the public product experience before publication.',
  },
  {
    title: 'Corrections',
    body:
      'When a factual issue is found, PicSpeak updates the affected page as soon as practical and keeps the corrected claim close to the original context. Material product, pricing, or policy changes are reflected on the relevant public page and may also be summarized in Updates.',
  },
  {
    title: 'Dates and Review Cadence',
    body:
      'Evergreen trust and AI-discovery surfaces use explicit review dates when the page format supports them. The AI markdown mirrors and llms.txt currently use a last reviewed date of 2026-08-09 so crawlers can separate current editorial guidance from older product notes.',
  },
  {
    title: 'AI-Assistance Disclosure',
    body:
      'PicSpeak uses AI systems in the product itself for photo critique and visual-reference generation. Public editorial text may be drafted, checked, or reformatted with AI assistance, but factual claims, source links, product boundaries, and final publication decisions remain under human review.',
  },
  {
    title: 'Source and Provenance',
    body:
      'Product claims should be traceable to the live PicSpeak interface, source code, public update notes, or cited creator/source pages. Prompt-library examples identify the original source URL and author handle when known, and PicSpeak describes its adaptation boundary without claiming extra license rights.',
  },
  {
    title: 'Sponsorship and Conflicts',
    body:
      'PicSpeak may operate affiliate or paid product flows, but editorial guidance should not present paid placement as independent evaluation. Any sponsorship, commercial relationship, or material conflict that affects a public recommendation should be disclosed near the relevant content.',
  },
  {
    title: 'Contact',
    body:
      `Send correction requests, source questions, or conflict disclosures to ${siteConfig.author.email}. Include the page URL, the claim at issue, and any supporting source so the correction can be reviewed quickly.`,
  },
];

const POLICY_COPY: Record<Locale, PolicyCopy> = {
  en: {
    eyebrow: 'Trust and corrections',
    title,
    description,
    lastReviewed: 'Last reviewed: 2026-08-09',
    authorProfile: 'Author profile',
    contactEditorial: 'Contact editorial',
    sections: policySections,
  },
  zh: {
    eyebrow: '信任与纠错',
    title: '编辑与纠错政策',
    description:
      'PicSpeak 如何审阅教育与产品内容、处理更正、披露 AI 辅助、记录来源，并管理赞助或利益冲突。',
    lastReviewed: '最近审阅：2026-08-09',
    authorProfile: '作者资料',
    contactEditorial: '联系编辑',
    sections: [
      {
        title: '编辑审阅',
        body:
          'PicSpeak 内容由 Asa Zhou 为使用 AI 点评作为可重复学习循环的摄影者和创作者撰写或编辑。产品页面、Lens Notes 摘要、提示词库说明和面向 AI 的 Markdown 镜像在发布前都会检查是否与公开产品体验一致。',
      },
      {
        title: '更正',
        body:
          '发现事实问题后，PicSpeak 会尽快更新受影响页面，并让修正后的表述尽量靠近原上下文。重要的产品、价格或政策变化会反映在相关公开页面中，也可能在 Updates 中概述。',
      },
      {
        title: '日期与审阅节奏',
        body:
          '长期有效的信任页面和 AI 发现页面会在页面格式支持时使用明确审阅日期。AI Markdown 镜像和 llms.txt 当前使用 2026-08-09 作为最近审阅日期，便于 crawler 区分当前编辑指引和较旧产品说明。',
      },
      {
        title: 'AI 辅助披露',
        body:
          'PicSpeak 产品本身使用 AI 系统完成照片点评和视觉参考生成。公开编辑文本可能由 AI 辅助起草、检查或重排，但事实性主张、来源链接、产品边界和最终发布决定都保留人工审阅。',
      },
      {
        title: '来源与出处',
        body:
          '产品主张应能追溯到实时 PicSpeak 界面、源代码、公开更新记录或引用的创作者/来源页面。提示词库示例会在已知时标明原始来源 URL 和作者标识，并说明 PicSpeak 的改写边界，不声称额外授权权利。',
      },
      {
        title: '赞助与利益冲突',
        body:
          'PicSpeak 可能运行联盟推广或付费产品流程，但编辑性指导不应把付费展示包装成独立评估。任何影响公开推荐的赞助、商业关系或重大利益冲突，都应在相关内容附近披露。',
      },
      {
        title: '联系',
        body:
          `更正请求、来源问题或利益冲突披露可发送至 ${siteConfig.author.email}。请附上页面 URL、存在争议的表述以及支持来源，便于快速审阅。`,
      },
    ],
  },
  ja: {
    eyebrow: '信頼と訂正',
    title: '編集・訂正ポリシー',
    description:
      'PicSpeak が教育コンテンツと製品コンテンツをどのように確認し、訂正、AI 支援の開示、出典記録、スポンサーシップや利益相反を扱うかを説明します。',
    lastReviewed: '最終確認日: 2026-08-09',
    authorProfile: '著者プロフィール',
    contactEditorial: '編集窓口へ連絡',
    sections: [
      {
        title: '編集レビュー',
        body:
          'PicSpeak のコンテンツは、AI 批評を反復的な学習ループとして使う写真家やクリエイターに向けて、Asa Zhou が執筆または編集します。製品ページ、Lens Notes の要約、プロンプトライブラリの説明、AI 向け Markdown ミラーは、公開前に実際の製品体験と整合しているか確認します。',
      },
      {
        title: '訂正',
        body:
          '事実に関する問題が見つかった場合、PicSpeak は実務上可能な限り早く該当ページを更新し、訂正された主張を元の文脈に近い場所に保ちます。重要な製品、価格、ポリシーの変更は関連する公開ページに反映し、Updates に要約する場合もあります。',
      },
      {
        title: '日付と確認頻度',
        body:
          '長期的に参照される信頼ページと AI 発見向けページでは、ページ形式が対応している場合に明確な確認日を表示します。AI Markdown ミラーと llms.txt は現在、crawler が現在の編集指針と古い製品メモを区別できるよう、最終確認日を 2026-08-09 としています。',
      },
      {
        title: 'AI 支援の開示',
        body:
          'PicSpeak は製品内で写真批評と視覚参考生成のために AI システムを使用します。公開編集テキストは AI の支援で下書き、確認、整形されることがありますが、事実主張、出典リンク、製品境界、最終公開判断は人間が確認します。',
      },
      {
        title: '出典と来歴',
        body:
          '製品に関する主張は、実際の PicSpeak インターフェース、ソースコード、公開アップデート、または引用されたクリエイター/出典ページへ追跡できる必要があります。プロンプトライブラリの例は、判明している場合に元 URL と作者ハンドルを示し、追加のライセンス権を主張せずに適応範囲を説明します。',
      },
      {
        title: 'スポンサーシップと利益相反',
        body:
          'PicSpeak はアフィリエイトや有料製品フローを運用する場合がありますが、編集ガイダンスで有料掲載を独立評価として見せるべきではありません。公開推薦に影響するスポンサー、商業関係、重大な利益相反は、関連コンテンツの近くで開示します。',
      },
      {
        title: '連絡先',
        body:
          `訂正依頼、出典に関する質問、利益相反の開示は ${siteConfig.author.email} へ送ってください。ページ URL、問題のある主張、補足資料を含めると確認が早くなります。`,
      },
    ],
  },
};

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-picspeak-locale');
  return isSupportedLocale(locale) ? locale : 'en';
}

export const metadata: Metadata = {
  title,
  description,
  robots: INDEXABLE_ROBOTS,
  alternates: singlePageAlternates(POLICY_PATH),
  openGraph: {
    type: 'website',
    url: POLICY_URL,
    siteName: siteConfig.name,
    title,
    description,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak editorial and corrections policy',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

export default async function EditorialPolicyPage() {
  const locale = await getRequestLocale();
  const copy = POLICY_COPY[locale];
  const webpageJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${POLICY_URL}#webpage`,
    name: title,
    description,
    url: POLICY_URL,
    dateModified: '2026-08-09',
    reviewedBy: {
      '@id': siteConfig.author.id,
    },
    author: {
      '@id': siteConfig.author.id,
    },
    publisher: {
      '@type': 'Organization',
      '@id': siteConfig.organizationId,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.url}${siteConfig.logoImage}`,
      },
    },
    isPartOf: {
      '@id': siteConfig.websiteId,
    },
    mainEntity: {
      '@type': 'CreativeWork',
      name: 'PicSpeak editorial and corrections standards',
      about: policySections.map((section) => ({
        '@type': 'Thing',
        name: section.title,
      })),
    },
  };
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Editorial and Corrections Policy', path: POLICY_PATH },
    ],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(webpageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="min-h-screen px-6 py-16">
        <article className="mx-auto max-w-4xl">
          <p className="text-xs uppercase tracking-[0.32em] text-accent-muted">{copy.eyebrow}</p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-ink-muted">{copy.description}</p>
          <p className="mt-4 text-sm text-ink-subtle">{copy.lastReviewed}</p>

          <div className="mt-10 grid gap-5">
            {copy.sections.map((section) => (
              <section key={section.title} className="border-t border-border-subtle pt-5">
                <h2 className="font-display text-2xl text-ink">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-border-subtle pt-6">
            <Link href="/author/asa-zhou" className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void">
              {copy.authorProfile}
            </Link>
            <a
              href={`mailto:${siteConfig.author.email}`}
              className="rounded-full border border-border-subtle px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
            >
              {copy.contactEditorial}
            </a>
          </div>
        </article>
      </div>
    </>
  );
}
