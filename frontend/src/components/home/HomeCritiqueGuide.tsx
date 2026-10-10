import Link from 'next/link';

export default function HomeCritiqueGuide() {
  return (
    <section className="border-t border-border-subtle px-5 py-10 sm:px-6 sm:py-14" aria-labelledby="home-critique-guide-title">
      <div className="mx-auto max-w-editorial">
        <p className="ui-eyebrow">Using AI photo critique</p>
        <h2 id="home-critique-guide-title" className="mt-3 max-w-3xl font-display text-3xl text-ink sm:text-4xl">
          What can the critique tell you about your photo?
        </h2>
        <div className="mt-7 grid gap-6 md:grid-cols-3 md:gap-8">
          <article className="border-t border-gold/35 pt-4">
            <h3 className="font-display text-xl text-ink">Look for visible evidence</h3>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              AI can point out competing subjects, distracting edges, light and color relationships,
              and apparent detail loss. In the ginkgo example above, it identifies the warm leaves
              against the blue sky and suggests foreground detail to give the scene more depth.
            </p>
            <Link href="/gallery" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-light">
              Explore photo critique examples →
            </Link>
          </article>
          <article className="border-t border-gold/35 pt-4">
            <h3 className="font-display text-xl text-ink">Check it against your intention</h3>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              You decide whether the canopy is meant to feel abstract or show a place. More foreground
              may help a story but weaken a simple color study. Check any claim about focus or exposure
              against the original file; a preview cannot establish camera settings or recover clipped detail.
            </p>
            <Link href="/en/blog/five-photo-composition-checks" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-light">
              Check the composition yourself →
            </Link>
          </article>
          <article className="border-t border-gold/35 pt-4">
            <h3 className="font-display text-xl text-ink">Choose one next-shoot action</h3>
            <p className="mt-3 text-sm leading-7 text-ink-muted">
              For that ginkgo photo, try a lower viewpoint that includes fallen leaves while keeping the
              canopy as the subject. Compare whether the foreground adds depth without taking attention
              away from the leaves. Keep the original and retake together; a higher score alone does not show improvement.
            </p>
            <Link href="/en/blog/ai-photo-critique-daily-practice" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-gold hover:text-gold-light">
              Follow the shoot–review–retake workflow →
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
