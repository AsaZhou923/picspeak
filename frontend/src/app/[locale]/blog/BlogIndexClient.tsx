'use client';

import Link from 'next/link';
import { ArrowRight, Clock3, Sparkles } from 'lucide-react';
import { getBlogPosts, getBlogUi } from '@/lib/blog-data';
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n';
import { siteConfig } from '@/lib/site';
import { VALID_LOCALES } from '../locales';

function BlogIndexContent() {
  const { locale } = useI18n();
  const ui = getBlogUi(locale);
  const posts = getBlogPosts(locale);
  const featuredPost = posts[0];

  const collectionJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: ui.title,
    description: ui.description,
    url: `${siteConfig.url}/${locale}/blog`,
    author: {
      '@id': siteConfig.author.id,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
    },
    hasPart: posts.map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
      datePublished: post.publishedAt,
      dateModified: post.updatedAt,
      keywords: post.keywords.join(', '),
      author: {
        '@id': siteConfig.author.id,
      },
    })),
  };

  const authorJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': siteConfig.author.id,
    name: siteConfig.author.name,
    alternateName: siteConfig.author.alternateName,
    jobTitle: siteConfig.author.jobTitle,
    description: siteConfig.author.description,
    email: siteConfig.author.email,
    sameAs: [siteConfig.social.x, siteConfig.social.githubProfile],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(authorJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionJsonLd) }}
      />

      <div className="min-h-screen pt-14">
        <div className="mx-auto max-w-[1120px] px-6 py-10 sm:py-12">
          <section className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.18fr)_340px]">
            <div className="animate-fade-in">
              <p className="mb-3 text-xs uppercase tracking-[0.32em] text-gold/70">{ui.label}</p>
              <h1 className="max-w-2xl font-display text-4xl text-ink sm:text-5xl">{ui.name}</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">{ui.introPrimary}</p>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">{ui.introSecondary}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-border-subtle bg-raised/35 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gold/75">{ui.starterPostsLabel}</p>
                  <p className="mt-2 font-mono text-2xl text-ink">{posts.length}</p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-raised/35 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gold/75">{ui.primaryTopicsLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{ui.primaryTopicsText}</p>
                </div>
                <div className="rounded-2xl border border-border-subtle bg-raised/35 px-4 py-4">
                  <p className="text-[11px] uppercase tracking-[0.22em] text-gold/75">{ui.seoDirectionLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-ink-muted">{ui.seoDirectionText}</p>
                </div>
              </div>

              {featuredPost ? (
                <section className="mt-8 overflow-hidden rounded-[30px] border border-border-subtle bg-[linear-gradient(135deg,rgba(200,162,104,0.11),transparent_38%),rgb(var(--color-surface)/0.78)]">
                  <div className="px-6 py-7 lg:px-8">
                    <p className="text-xs uppercase tracking-[0.26em] text-gold/72">{ui.featuredLabel}</p>
                    <h2 className="mt-4 max-w-3xl font-display text-3xl text-ink sm:text-4xl">{featuredPost.title}</h2>
                    <p className="mt-4 max-w-3xl text-sm leading-7 text-ink-muted sm:text-base">{featuredPost.excerpt}</p>
                    <div className="mt-6 flex flex-wrap gap-3 text-xs text-ink-subtle">
                      <span className="rounded-full border border-border-subtle px-3 py-1">{featuredPost.category}</span>
                      <span className="rounded-full border border-border-subtle px-3 py-1">{featuredPost.publishedAt}</span>
                      <span className="rounded-full border border-border-subtle px-3 py-1">{featuredPost.readingTime}</span>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {featuredPost.keywords.map((keyword) => (
                        <span key={keyword} className="rounded-full border border-border-subtle bg-raised/30 px-3 py-1 text-xs text-ink-muted">
                          {keyword}
                        </span>
                      ))}
                    </div>
                    <div className="mt-7">
                      <Link href={`/${locale}/blog/${featuredPost.slug}`} className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light">
                        {ui.readFeaturedCta}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="rounded-[28px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.14),transparent_34%),rgb(var(--color-surface)/0.82)] p-6 text-ink">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold">
                <Sparkles size={18} />
              </div>
              <h2 className="mt-5 font-display text-3xl">{ui.startTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-ink-muted">{ui.startIntro}</p>
              <div className="mt-6 grid gap-3 text-sm text-ink-muted">
                {posts.map((post, index) => (
                  <Link key={post.slug} href={`/${locale}/blog/${post.slug}`} className="rounded-2xl border border-border-subtle bg-raised/40 px-4 py-3 transition-colors hover:border-gold/30 hover:text-ink">
                    <p className="text-[11px] uppercase tracking-[0.22em] text-gold/75">0{index + 1}</p>
                    <p className="mt-2 leading-6">{post.title}</p>
                  </Link>
                ))}
              </div>
            </aside>
          </section>

          <section className="mt-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-gold/70">{ui.allPostsLabel}</p>
                <h2 className="mt-2 font-display text-3xl text-ink">{ui.allPostsHeading}</h2>
              </div>
              <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{posts.length}</p>
            </div>

            <div className="grid gap-5 lg:grid-cols-3">
              {posts.map((post) => (
                <article key={post.slug} className="group rounded-[26px] border border-border-subtle bg-raised/45 p-5 transition-all duration-300 hover:border-gold/30 hover:bg-raised/60">
                  <div className="flex items-center justify-between gap-3 text-xs text-ink-subtle">
                    <span className="rounded-full border border-border-subtle px-2.5 py-1">{post.category}</span>
                    <span>{post.publishedAt}</span>
                  </div>
                  <h3 className="mt-4 font-display text-2xl text-ink">{post.title}</h3>
                  <p className="mt-3 text-sm leading-7 text-ink-muted">{post.excerpt}</p>
                  <div className="mt-4 flex items-center gap-2 text-xs text-ink-subtle">
                    <Clock3 size={13} className="text-gold/85" />
                    <span>{post.readingTime}</span>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {post.keywords.slice(0, 3).map((keyword) => (
                      <span key={keyword} className="rounded-full border border-border-subtle bg-void/35 px-2.5 py-1 text-[11px] text-ink-muted">
                        {keyword}
                      </span>
                    ))}
                  </div>
                  <div className="mt-6">
                    <Link href={`/${locale}/blog/${post.slug}`} className="inline-flex items-center gap-2 text-sm text-gold transition-colors group-hover:text-gold-light">
                      {ui.readMoreCta}
                      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

export default function BlogIndexClient({ locale }: { locale: string }) {
  const pinnedLocale: Locale = VALID_LOCALES.includes(locale as Locale)
    ? (locale as Locale)
    : 'en';

  return (
    <I18nProvider initialLocale={pinnedLocale}>
      <BlogIndexContent />
    </I18nProvider>
  );
}
