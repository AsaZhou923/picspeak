import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Camera, Github, Mail, Sparkles, Twitter } from 'lucide-react';
import { serializeJsonLd } from '@/lib/json-ld';
import type { Locale } from '@/lib/i18n';
import { isSupportedLocale } from '@/lib/locale';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const AUTHOR_PATH = '/author/asa-zhou';
const AUTHOR_URL = `${siteConfig.url}${AUTHOR_PATH}`;
const POLICY_PATH = '/editorial-policy';
const POLICY_URL = `${siteConfig.url}${POLICY_PATH}`;

export const metadata: Metadata = {
  title: 'Asa Zhou — Founder and Lens Notes Editor',
  description:
    'Asa Zhou builds PicSpeak and writes Lens Notes about AI photo critique, composition, lighting, color, and repeatable review workflows.',
  robots: INDEXABLE_ROBOTS,
  alternates: {
    canonical: AUTHOR_PATH,
  },
  openGraph: {
    type: 'profile',
    url: AUTHOR_URL,
    title: 'Asa Zhou | PicSpeak Founder and Lens Notes Editor',
    description: siteConfig.author.description,
    siteName: siteConfig.name,
    images: [
      {
        url: siteConfig.ogImage,
        width: siteConfig.ogImageWidth,
        height: siteConfig.ogImageHeight,
        alt: 'PicSpeak AI photo critique workspace',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Asa Zhou | PicSpeak Founder and Lens Notes Editor',
    description: siteConfig.author.description,
    images: [siteConfig.ogImage],
    creator: '@Zzw_Prime',
  },
};

type AuthorCopy = {
  eyebrow: string;
  description: string;
  readLensNotes: string;
  browsePrompts: string;
  editorialPolicy: string;
  paragraphs: readonly string[];
  entitySignals: string;
  role: string;
  project: string;
  topics: string;
  topicList: string;
  focusAreas: readonly {
    title: string;
    body: string;
    icon: typeof Camera;
  }[];
};

const AUTHOR_COPY: Record<Locale, AuthorCopy> = {
  en: {
    eyebrow: 'Author',
    description: siteConfig.author.description,
    readLensNotes: 'Read Lens Notes',
    browsePrompts: 'Browse prompt examples',
    editorialPolicy: 'Editorial policy',
    paragraphs: [
      'Asa Zhou is the founder of PicSpeak and the editor responsible for the public Lens Notes and prompt-library surfaces connected to the product. His work focuses on making AI photo critique useful for practical photographers rather than treating a score as the final answer. In PicSpeak, that means shaping review flows around composition, lighting, color, impact, and technique, then turning those observations into next-shoot decisions a user can test.',
      'The author page, Lens Notes articles, and AI-facing markdown summaries describe how the product is meant to be used: upload a photo, read the critique with attention to tradeoffs, compare it with your own intent, and decide what to change before the next capture or edit. Asa also reviews the public wording around plan limits, AI Create credits, prompt examples, and gallery examples so that educational claims stay aligned with the live product rather than drifting into unsupported marketing claims.',
      'For AI Create and the prompt library, Asa curates examples as references for adaptation. Source URLs and author handles are kept visible when available, and PicSpeak describes the boundary between the original prompt/source material, the localized or adapted PicSpeak presentation, and the generated example image. The goal is to help users understand prompt structure and visual direction without implying that PicSpeak owns third-party source posts or grants rights beyond the material it publishes itself.',
      'Editorial responsibility includes keeping correction paths clear. When product behavior, pricing, public URLs, or source attribution changes, Asa reviews the affected page and updates the public copy where needed. Correction requests and provenance questions can be sent to the listed contact address. The shared policy explains review cadence, AI-assistance disclosure, source handling, sponsorship boundaries, and how PicSpeak treats material corrections across public pages, public examples, and AI discovery files.',
    ],
    entitySignals: 'Entity signals',
    role: 'Role',
    project: 'Project',
    topics: 'Topics',
    topicList: 'AI critique, composition, lighting, color, GPT Image 2',
    focusAreas: [
      {
        title: 'AI photo critique systems',
        body: 'Designs review flows that turn composition, lighting, color, and technical quality into concrete next-shot guidance.',
        icon: Camera,
      },
      {
        title: 'Lens Notes editorial work',
        body: 'Publishes practical photography essays for people using AI feedback as a repeatable learning loop.',
        icon: BookOpenText,
      },
      {
        title: 'AI Create prompt references',
        body: 'Curates GPT Image 2 visual prompt examples that connect photo critique with generated creative references.',
        icon: Sparkles,
      },
    ],
  },
  zh: {
    eyebrow: '作者',
    description: 'Asa Zhou 创建 PicSpeak，并负责 Lens Notes、提示词示例和公开信任页面的编辑把关。',
    readLensNotes: '阅读 Lens Notes',
    browsePrompts: '浏览提示词示例',
    editorialPolicy: '编辑政策',
    paragraphs: [
      'Asa Zhou 是 PicSpeak 的创建者，也是公开 Lens Notes 和提示词库页面的责任编辑。他的工作重点是让 AI 摄影点评真正服务于实践摄影者，而不是把分数当成最终答案。在 PicSpeak 中，这意味着围绕构图、光线、色彩、表达和技术质量组织点评流程，再把观察转化为用户下一次拍摄可以验证的具体行动。',
      '作者页、Lens Notes 文章和面向 AI 发现的 Markdown 摘要，说明了产品应如何被使用：上传照片，带着取舍意识阅读点评，对照自己的拍摄意图，然后决定下一次拍摄或修图要改变什么。Asa 也会审阅套餐限制、AI Create 额度、提示词示例和 Gallery 示例的公开措辞，确保教育性表述与真实产品保持一致，不滑向没有依据的营销承诺。',
      '在 AI Create 与提示词库中，Asa 将示例作为可改写的参考来整理。若存在原始来源链接和作者标识，PicSpeak 会保持可见，并说明原始提示词/来源材料、本地化或改写后的 PicSpeak 呈现，以及生成示例图之间的边界。目标是帮助用户理解提示词结构和视觉方向，而不是暗示 PicSpeak 拥有第三方来源内容或授予额外权利。',
      '编辑责任也包括清晰的纠错路径。当产品行为、价格、公开 URL 或来源标注发生变化时，Asa 会审阅受影响页面并在需要时更新公开文案。纠错请求和来源问题可以发送到页面列出的联系邮箱。共享政策说明了审阅节奏、AI 辅助披露、来源处理、赞助边界，以及 PicSpeak 如何处理公开页面、公开示例和 AI 发现文件中的重要更正。',
    ],
    entitySignals: '实体信号',
    role: '角色',
    project: '项目',
    topics: '主题',
    topicList: 'AI 摄影点评、构图、光线、色彩、GPT Image 2',
    focusAreas: [
      {
        title: 'AI 摄影点评系统',
        body: '设计点评流程，把构图、光线、色彩和技术质量转化为下一次拍摄可执行的建议。',
        icon: Camera,
      },
      {
        title: 'Lens Notes 编辑工作',
        body: '发布实用摄影文章，帮助用户把 AI 反馈变成可重复的学习循环。',
        icon: BookOpenText,
      },
      {
        title: 'AI Create 提示词参考',
        body: '整理 GPT Image 2 视觉提示词示例，让摄影点评与生成参考图建立清楚连接。',
        icon: Sparkles,
      },
    ],
  },
  ja: {
    eyebrow: '著者',
    description: 'Asa Zhou は PicSpeak の開発者であり、Lens Notes、プロンプト例、公開信頼ページの編集責任者です。',
    readLensNotes: 'Lens Notes を読む',
    browsePrompts: 'プロンプト例を見る',
    editorialPolicy: '編集ポリシー',
    paragraphs: [
      'Asa Zhou は PicSpeak の創設者であり、製品に結びつく公開 Lens Notes とプロンプトライブラリの編集を担当しています。重視しているのは、AI 写真批評を実践的な撮影者に役立つ学習道具にすることで、スコアを最終結論として扱うことではありません。PicSpeak では、構図、光、色、印象、技術を軸に講評を組み立て、その観察を次の撮影で試せる具体的な判断に変換します。',
      '著者ページ、Lens Notes 記事、AI 向け Markdown 要約は、製品の使い方を説明します。写真をアップロードし、トレードオフに注意して講評を読み、自分の意図と照らし合わせ、次の撮影や編集で何を変えるかを決めます。Asa はプラン制限、AI Create クレジット、プロンプト例、Gallery 例の公開文言も確認し、教育的な主張が実際の製品から離れたマーケティング表現にならないようにしています。',
      'AI Create とプロンプトライブラリでは、Asa は例を応用のための参考として整理します。元の URL や作者ハンドルが分かる場合は表示し、元プロンプトやソース素材、PicSpeak によるローカライズまたは適応表示、生成された例画像の境界を説明します。目的は、ユーザーがプロンプト構造と視覚方向を理解できるようにすることであり、PicSpeak が第三者の投稿を所有したり追加の権利を与えたりすることを示すものではありません。',
      '編集責任には、訂正経路を明確に保つことも含まれます。製品挙動、価格、公開 URL、出典表示が変わった場合、Asa は該当ページを確認し、必要に応じて公開文言を更新します。訂正依頼や出典に関する質問は、掲載されている連絡先へ送ることができます。共通ポリシーでは、レビュー頻度、AI 支援の開示、出典の扱い、スポンサーシップの境界、公開ページ・公開例・AI 発見ファイルでの重要訂正の扱いを説明しています。',
    ],
    entitySignals: 'エンティティ情報',
    role: '役割',
    project: 'プロジェクト',
    topics: 'トピック',
    topicList: 'AI 写真批評、構図、光、色、GPT Image 2',
    focusAreas: [
      {
        title: 'AI 写真批評システム',
        body: '構図、光、色、技術品質を次の撮影に使える具体的なガイダンスへ変換する講評フローを設計します。',
        icon: Camera,
      },
      {
        title: 'Lens Notes の編集',
        body: 'AI フィードバックを反復できる学習サイクルとして使うための実践的な写真エッセイを公開します。',
        icon: BookOpenText,
      },
      {
        title: 'AI Create プロンプト参考',
        body: '写真批評と生成用ビジュアル参考をつなぐ GPT Image 2 プロンプト例を整理します。',
        icon: Sparkles,
      },
    ],
  },
};

async function getRequestLocale(): Promise<Locale> {
  const requestHeaders = await headers();
  const locale = requestHeaders.get('x-picspeak-locale');
  return isSupportedLocale(locale) ? locale : 'en';
}

export default async function AsaZhouAuthorPage() {
  const locale = await getRequestLocale();
  const copy = AUTHOR_COPY[locale];
  const blogHref = `/${locale}/blog`;
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': siteConfig.author.id,
    name: siteConfig.author.name,
    alternateName: siteConfig.author.alternateName,
    jobTitle: siteConfig.author.jobTitle,
    description: siteConfig.author.description,
    email: siteConfig.author.email,
    url: AUTHOR_URL,
    sameAs: [siteConfig.social.x, siteConfig.social.githubProfile],
    publishingPrinciples: POLICY_URL,
    worksFor: {
      '@type': 'Organization',
      '@id': siteConfig.organizationId,
      name: siteConfig.name,
      url: siteConfig.url,
    },
    knowsAbout: siteConfig.author.knowsAbout,
  };

  const profileJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: 'Asa Zhou author profile',
    url: AUTHOR_URL,
    mainEntity: {
      '@id': siteConfig.author.id,
    },
    isPartOf: {
      '@id': siteConfig.websiteId,
    },
  };
  const breadcrumbJsonLd = buildPublicBreadcrumbJsonLd({
    site: siteConfig,
    items: [
      { name: siteConfig.name, path: '/en' },
      { name: 'Asa Zhou', path: AUTHOR_PATH },
    ],
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(profileJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />

      <div className="min-h-screen pt-10">
        <section className="mx-auto grid max-w-[1120px] gap-8 px-6 py-12 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-16">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.32em] text-accent-muted">{copy.eyebrow}</p>
            <h1 className="max-w-3xl font-display text-4xl text-ink sm:text-5xl">Asa Zhou</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted">{copy.description}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href={blogHref}
                className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light"
              >
                {copy.readLensNotes}
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/generate/prompts"
                className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold/40 hover:text-gold"
              >
                {copy.browsePrompts}
              </Link>
              <Link
                href={POLICY_PATH}
                className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold/40 hover:text-gold"
              >
                {copy.editorialPolicy}
              </Link>
            </div>

            <section className="mt-10 space-y-5 text-sm leading-8 text-ink-muted">
              {copy.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {copy.focusAreas.map((area) => {
                const Icon = area.icon;

                return (
                  <article key={area.title} className="rounded-[24px] border border-border-subtle bg-raised/40 p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold">
                      <Icon size={18} />
                    </div>
                    <h2 className="mt-4 font-display text-2xl text-ink">{area.title}</h2>
                    <p className="mt-3 text-sm leading-7 text-ink-muted">{area.body}</p>
                  </article>
                );
              })}
            </div>
          </div>

          <aside className="rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_34%),rgb(var(--color-surface)/0.82)] p-6 text-ink">
            <p className="text-xs uppercase tracking-[0.26em] text-accent-muted">{copy.entitySignals}</p>
            <dl className="mt-5 grid gap-5 text-sm">
              <div>
                <dt className="text-ink-subtle">{copy.role}</dt>
                <dd className="mt-1 text-ink">{siteConfig.author.jobTitle}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">{copy.project}</dt>
                <dd className="mt-1 text-ink">{siteConfig.name}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">{copy.topics}</dt>
                <dd className="mt-1 text-ink">{copy.topicList}</dd>
              </div>
            </dl>

            <div className="mt-7 grid gap-3">
              <a
                href={`mailto:${siteConfig.author.email}`}
                className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-raised/40 px-4 py-3 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-ink"
              >
                <Mail size={15} className="text-gold/85" />
                {siteConfig.author.email}
              </a>
              <a
                href={siteConfig.social.githubProfile}
                className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-raised/40 px-4 py-3 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-ink"
              >
                <Github size={15} className="text-gold/85" />
                GitHub
              </a>
              <a
                href={siteConfig.social.x}
                className="inline-flex items-center gap-2 rounded-2xl border border-border-subtle bg-raised/40 px-4 py-3 text-sm text-ink-muted transition-colors hover:border-gold/35 hover:text-ink"
              >
                <Twitter size={15} className="text-gold/85" />
                X / Twitter
              </a>
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}
