import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Camera, Github, Mail, Sparkles, Twitter } from 'lucide-react';
import { serializeJsonLd } from '@/lib/json-ld';
import { buildPublicBreadcrumbJsonLd, INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const AUTHOR_PATH = '/author/asa-zhou';
const AUTHOR_URL = `${siteConfig.url}${AUTHOR_PATH}`;
const POLICY_PATH = '/editorial-policy';
const POLICY_URL = `${siteConfig.url}${POLICY_PATH}`;

export const metadata: Metadata = {
  title: 'Asa Zhou | PicSpeak Founder and Lens Notes Editor',
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

const focusAreas = [
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
];

export default function AsaZhouAuthorPage() {
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
            <p className="mb-3 text-xs uppercase tracking-[0.32em] text-gold/70">Author</p>
            <h1 className="max-w-3xl font-display text-4xl text-ink sm:text-5xl">Asa Zhou</h1>
            <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted">{siteConfig.author.description}</p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/en/blog"
                className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light"
              >
                Read Lens Notes
                <ArrowRight size={14} />
              </Link>
              <Link
                href="/generate/prompts"
                className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold/40 hover:text-gold"
              >
                Browse prompt examples
              </Link>
              <Link
                href={POLICY_PATH}
                className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:border-gold/40 hover:text-gold"
              >
                Editorial policy
              </Link>
            </div>

            <section className="mt-10 space-y-5 text-sm leading-8 text-ink-muted">
              <p>
                Asa Zhou is the founder of PicSpeak and the editor responsible for the public Lens Notes
                and prompt-library surfaces connected to the product. His work focuses on making AI photo
                critique useful for practical photographers rather than treating a score as the final answer.
                In PicSpeak, that means shaping review flows around composition, lighting, color, impact,
                and technique, then turning those observations into next-shoot decisions a user can test.
              </p>
              <p>
                The author page, Lens Notes articles, and AI-facing markdown summaries describe how the
                product is meant to be used: upload a photo, read the critique with attention to tradeoffs,
                compare it with your own intent, and decide what to change before the next capture or edit.
                Asa also reviews the public wording around plan limits, AI Create credits, prompt examples,
                and gallery examples so that educational claims stay aligned with the live product rather
                than drifting into unsupported marketing claims.
              </p>
              <p>
                For AI Create and the prompt library, Asa curates examples as references for adaptation.
                Source URLs and author handles are kept visible when available, and PicSpeak describes the
                boundary between the original prompt/source material, the localized or adapted PicSpeak
                presentation, and the generated example image. The goal is to help users understand prompt
                structure and visual direction without implying that PicSpeak owns third-party source posts
                or grants rights beyond the material it publishes itself.
              </p>
              <p>
                Editorial responsibility includes keeping correction paths clear. When product behavior,
                pricing, public URLs, or source attribution changes, Asa reviews the affected page and updates
                the public copy where needed. Correction requests and provenance questions can be sent to the
                listed contact address. The shared policy explains review cadence, AI-assistance disclosure,
                source handling, sponsorship boundaries, and how PicSpeak treats material corrections across
                public pages, public examples, and AI discovery files.
              </p>
            </section>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {focusAreas.map((area) => {
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
            <p className="text-xs uppercase tracking-[0.26em] text-gold/72">Entity signals</p>
            <dl className="mt-5 grid gap-5 text-sm">
              <div>
                <dt className="text-ink-subtle">Role</dt>
                <dd className="mt-1 text-ink">{siteConfig.author.jobTitle}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Project</dt>
                <dd className="mt-1 text-ink">{siteConfig.name}</dd>
              </div>
              <div>
                <dt className="text-ink-subtle">Topics</dt>
                <dd className="mt-1 text-ink">AI critique, composition, lighting, color, GPT Image 2</dd>
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
