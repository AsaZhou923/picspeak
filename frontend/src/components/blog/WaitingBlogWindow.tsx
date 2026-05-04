'use client';

import { useState } from 'react';
import { BookOpenText, Clock3 } from 'lucide-react';
import { getBlogPosts, getBlogUi, type BlogPost } from '@/lib/blog-data';
import { useI18n } from '@/lib/i18n';

type WaitingBlogWindowVariant = 'review' | 'generation';

const FEATURED_SLUGS: Record<WaitingBlogWindowVariant, string[]> = {
  review: [
    'five-photo-composition-checks',
    'lighting-mistakes-ai-catches',
    'color-grading-photography-guide',
  ],
  generation: [
    'turn-photo-feedback-into-shooting-checklist',
    'color-grading-photography-guide',
    'lighting-mistakes-ai-catches',
  ],
};

function pickWaitingPosts(posts: BlogPost[], variant: WaitingBlogWindowVariant) {
  const bySlug = new Map(posts.map((post) => [post.slug, post]));
  const picked = FEATURED_SLUGS[variant]
    .map((slug) => bySlug.get(slug))
    .filter((post): post is BlogPost => Boolean(post));

  if (picked.length >= 3) {
    return picked;
  }

  const existing = new Set(picked.map((post) => post.slug));
  return [
    ...picked,
    ...posts.filter((post) => !existing.has(post.slug)),
  ].slice(0, 3);
}

export function WaitingBlogWindow({ variant }: { variant: WaitingBlogWindowVariant }) {
  const { locale, t } = useI18n();
  const ui = getBlogUi(locale);
  const posts = pickWaitingPosts(getBlogPosts(locale), variant);
  const [activeSlug, setActiveSlug] = useState(posts[0]?.slug ?? '');
  const activePost = posts.find((post) => post.slug === activeSlug) ?? posts[0];
  const title = variant === 'generation' ? t('wait_blog_generation_title') : t('wait_blog_review_title');
  const body = variant === 'generation' ? t('wait_blog_generation_body') : t('wait_blog_review_body');

  return (
    <aside
      aria-label={t('wait_blog_aria_label')}
      className="flex w-full max-h-[calc(100vh-7rem)] flex-col rounded-lg border border-border-subtle bg-[linear-gradient(145deg,rgba(200,162,104,0.10),transparent_42%),rgb(var(--color-surface)/0.78)] p-4 text-left shadow-[0_18px_50px_rgba(0,0,0,0.14)] backdrop-blur-sm lg:sticky lg:top-20"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle/70 pb-3">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-rust/75" />
          <span className="h-2 w-2 rounded-full bg-gold/75" />
          <span className="h-2 w-2 rounded-full bg-sage/75" />
        </div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-gold/75">
          <BookOpenText size={13} />
          <span>{t('wait_blog_window_label')}</span>
        </div>
      </div>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-gold/75">{ui.label}</p>
          <h2 className="mt-2 font-display text-2xl leading-tight text-ink">{title}</h2>
        </div>
        <span className="rounded-full border border-gold/25 bg-gold/10 px-2.5 py-1 font-mono text-[10px] text-gold">
          {posts.length}
        </span>
      </div>
      <p className="mt-3 text-xs leading-6 text-ink-muted">{body}</p>

      <div className="mt-5 grid grid-cols-3 gap-2" aria-label={t('wait_blog_aria_label')}>
        {posts.map((post, index) => (
          <button
            key={post.slug}
            type="button"
            aria-pressed={activePost?.slug === post.slug}
            onClick={() => setActiveSlug(post.slug)}
            className={`min-w-0 rounded-md border px-2 py-2 text-left transition-colors ${
              activePost?.slug === post.slug
                ? 'border-gold/45 bg-gold/10 text-gold'
                : 'border-border-subtle bg-raised/35 text-ink-subtle hover:border-gold/30 hover:text-ink'
            }`}
          >
            <span className="block font-mono text-[10px]">{t('wait_blog_post_prefix')} {index + 1}</span>
            <span className="mt-1 block truncate text-xs">{post.category}</span>
          </button>
        ))}
      </div>

      {activePost && (
        <article className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-border-subtle/70 pt-4 pr-1">
          <div className="flex flex-wrap items-center gap-2 text-[10px] text-ink-subtle">
            <span className="rounded-full border border-border-subtle px-2.5 py-1">{activePost.category}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle px-2.5 py-1">
              <Clock3 size={12} className="text-gold/75" />
              {activePost.readingTime}
            </span>
          </div>

          <h3 className="mt-4 font-display text-2xl leading-tight text-ink">{activePost.title}</h3>
          <p className="mt-3 text-sm leading-7 text-ink-muted">{activePost.intro}</p>

          <section className="mt-5 rounded-md border border-gold/20 bg-gold/5 px-3 py-3">
            <h4 className="text-sm font-medium text-ink">{activePost.takeawayTitle}</h4>
            <ul className="mt-3 space-y-2 text-xs leading-6 text-ink-muted">
              {activePost.takeawayItems.map((item) => (
                <li key={item} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-gold/75" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-5 space-y-6">
            {activePost.sections.map((section) => (
              <section key={section.title}>
                <h4 className="text-base font-medium leading-7 text-ink">{section.title}</h4>
                <div className="mt-2 space-y-3 text-sm leading-7 text-ink-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.bullets ? (
                  <ul className="mt-3 space-y-2 text-xs leading-6 text-ink-muted">
                    {section.bullets.map((bullet) => (
                      <li key={bullet} className="grid grid-cols-[10px_minmax(0,1fr)] gap-2">
                        <span className="mt-2 h-1.5 w-1.5 rounded-full bg-sage/80" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
        </article>
      )}
    </aside>
  );
}
