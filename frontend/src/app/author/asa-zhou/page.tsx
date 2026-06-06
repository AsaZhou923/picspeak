import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BookOpenText, Camera, Github, Mail, Sparkles, Twitter } from 'lucide-react';
import { INDEXABLE_ROBOTS } from '@/lib/seo';
import { siteConfig } from '@/lib/site';

const AUTHOR_PATH = '/author/asa-zhou';
const AUTHOR_URL = `${siteConfig.url}${AUTHOR_PATH}`;

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
    worksFor: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
    knowsAbout: [
      'AI photo critique',
      'photography composition',
      'lighting analysis',
      'color feedback',
      'GPT Image 2 prompt examples',
    ],
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
      '@type': 'WebSite',
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileJsonLd) }}
      />

      <main className="min-h-screen pt-14">
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
            </div>

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
      </main>
    </>
  );
}
