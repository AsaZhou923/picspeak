'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Clock3 } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getBlogPost, getBlogPosts, getBlogUi } from '@/lib/blog-data';
import { I18nProvider, useI18n, type Locale } from '@/lib/i18n';
import { siteConfig } from '@/lib/site';
import { VALID_LOCALES } from '../../locales';

function BlogPostContent({ slug }: { slug: string }) {
  const { locale } = useI18n();
  const ui = getBlogUi(locale);
  const post = getBlogPost(locale, slug);

  if (!post) {
    notFound();
  }

  const relatedPosts = getBlogPosts(locale).filter((entry) => entry.slug !== post.slug).slice(0, 2);

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

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    inLanguage: locale,
    url: `${siteConfig.url}/${locale}/blog/${post.slug}`,
    isPartOf: {
      '@type': 'Blog',
      name: ui.name,
      url: `${siteConfig.url}/${locale}/blog`,
    },
    author: {
      '@id': siteConfig.author.id,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.url}${siteConfig.ogImage}`,
      },
    },
    mainEntityOfPage: `${siteConfig.url}/${locale}/blog/${post.slug}`,
    articleSection: post.category,
    keywords: post.keywords.join(', '),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(authorJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />

      <article className="min-h-screen pt-14">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <Link href={`/${locale}/blog`} className="inline-flex items-center gap-2 text-sm text-ink-muted transition-colors hover:text-gold">
            <ArrowLeft size={14} />
            {ui.backToBlog}
          </Link>

          <header className="mt-8 rounded-[30px] border border-border-subtle bg-[radial-gradient(circle_at_top_left,rgba(200,171,90,0.12),transparent_35%),rgb(var(--color-surface)/0.8)] px-6 py-8 sm:px-8">
            <p className="text-xs uppercase tracking-[0.28em] text-gold/72">{post.category}</p>
            <h1 className="mt-4 font-display text-4xl text-ink sm:text-5xl">{post.title}</h1>
            <p className="mt-5 text-sm leading-8 text-ink-muted sm:text-base">{post.intro}</p>
            <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-ink-subtle">
              <span>{post.publishedAt}</span>
              <span className="h-1 w-1 rounded-full bg-gold/80" />
              <span className="inline-flex items-center gap-2">
                <Clock3 size={14} className="text-gold/85" />
                {post.readingTime}
              </span>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {post.keywords.map((keyword) => (
                <span key={keyword} className="rounded-full border border-border-subtle bg-raised/35 px-3 py-1 text-xs text-ink-muted">
                  {keyword}
                </span>
              ))}
            </div>
          </header>

          <section className="mt-8 rounded-[28px] border border-border-subtle bg-raised/35 p-6 sm:p-7">
            <p className="text-xs uppercase tracking-[0.22em] text-gold/70">{post.takeawayTitle}</p>
            <div className="mt-4 grid gap-3">
              {post.takeawayItems.map((item) => (
                <p key={item} className="flex gap-3 text-sm leading-7 text-ink-muted">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
                  <span>{item}</span>
                </p>
              ))}
            </div>
          </section>

          <div className="mt-10 space-y-8">
            {post.sections.map((section) => (
              <section key={section.title} className="rounded-[26px] border border-border-subtle bg-void/30 px-6 py-6 sm:px-7">
                <h2 className="font-display text-3xl text-ink">{section.title}</h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-sm leading-8 text-ink-muted sm:text-base">
                      {paragraph}
                    </p>
                  ))}
                </div>
                {section.bullets && section.bullets.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {section.bullets.map((bullet) => (
                      <p key={bullet} className="flex gap-3 text-sm leading-7 text-ink-muted">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
                        <span>{bullet}</span>
                      </p>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <section className="mt-10 rounded-[30px] border border-border-subtle bg-[linear-gradient(135deg,rgba(200,162,104,0.12),transparent_42%),rgb(var(--color-surface)/0.78)] p-6 sm:p-7">
            <p className="text-xs uppercase tracking-[0.22em] text-gold/70">{ui.nextStepLabel}</p>
            <h2 className="mt-3 font-display text-3xl text-ink">{ui.nextStepTitle}</h2>
            <p className="mt-4 text-sm leading-7 text-ink-muted">{ui.nextStepBody}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/workspace" className="inline-flex items-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-void transition-colors hover:bg-gold-light">
                {ui.nextStepCta}
                <ArrowRight size={14} />
              </Link>
              <Link href={`/${locale}/blog`} className="inline-flex items-center gap-2 rounded-full border border-border-subtle px-5 py-2.5 text-sm text-ink-muted transition-colors hover:border-gold/30 hover:text-gold">
                {ui.moreArticlesCta}
              </Link>
            </div>
          </section>

          {relatedPosts.length > 0 ? (
            <section className="mt-10">
              <div className="mb-5">
                <p className="text-xs uppercase tracking-[0.22em] text-gold/70">{ui.relatedLabel}</p>
                <h2 className="mt-2 font-display text-3xl text-ink">{ui.relatedHeading}</h2>
              </div>
              <div className="grid gap-5 md:grid-cols-2">
                {relatedPosts.map((entry) => (
                  <article key={entry.slug} className="rounded-[24px] border border-border-subtle bg-raised/40 p-5 transition-colors hover:border-gold/30">
                    <p className="text-xs uppercase tracking-[0.22em] text-ink-subtle">{entry.category}</p>
                    <h3 className="mt-3 font-display text-2xl text-ink">{entry.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-ink-muted">{entry.excerpt}</p>
                    <div className="mt-5">
                      <Link href={`/${locale}/blog/${entry.slug}`} className="inline-flex items-center gap-2 text-sm text-gold transition-colors hover:text-gold-light">
                        {ui.readMoreCta}
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </article>
    </>
  );
}

export default function BlogPostClient({ locale, slug }: { locale?: string; slug: string }) {
  const pinnedLocale = VALID_LOCALES.includes(locale as Locale)
    ? (locale as Locale)
    : undefined;

  return (
    <I18nProvider initialLocale={pinnedLocale}>
      <BlogPostContent slug={slug} />
    </I18nProvider>
  );
}
