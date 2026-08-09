import type { Metadata } from 'next';
import Link from 'next/link';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS, singlePageAlternates } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const POLICY_PATH = '/editorial-policy';
const POLICY_URL = `${siteConfig.url}${POLICY_PATH}`;
const title = 'Editorial and Corrections Policy | PicSpeak';
const description =
  'How PicSpeak reviews educational and product content, handles corrections, discloses AI assistance, documents sources, and manages sponsorship or conflicts.';

const policySections = [
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

export default function EditorialPolicyPage() {
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
          <p className="text-xs uppercase tracking-[0.32em] text-gold/70">Trust and corrections</p>
          <h1 className="mt-4 font-display text-4xl leading-tight text-ink sm:text-5xl">
            Editorial and Corrections Policy
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-8 text-ink-muted">{description}</p>
          <p className="mt-4 text-sm text-ink-subtle">Last reviewed: 2026-08-09</p>

          <div className="mt-10 grid gap-5">
            {policySections.map((section) => (
              <section key={section.title} className="border-t border-border-subtle pt-5">
                <h2 className="font-display text-2xl text-ink">{section.title}</h2>
                <p className="mt-3 text-sm leading-7 text-ink-muted">{section.body}</p>
              </section>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-border-subtle pt-6">
            <Link href="/author/asa-zhou" className="rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void">
              Author profile
            </Link>
            <a
              href={`mailto:${siteConfig.author.email}`}
              className="rounded-full border border-border-subtle px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/40 hover:text-ink"
            >
              Contact editorial
            </a>
          </div>
        </article>
      </div>
    </>
  );
}
