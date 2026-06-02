import type { Locale } from '@/lib/i18n';
import { getInitialTranslations } from '@/lib/i18n-initial';

const HOME_SEO_FEATURE_KEYS = [
  ['feature_flash_title', 'feature_flash_body'],
  ['feature_pro_title', 'feature_pro_body'],
  ['feature_history_title', 'feature_history_body'],
] as const;

type HomeSeoFallbackProps = {
  locale: Locale;
};

export function HomeSeoFallback({ locale }: HomeSeoFallbackProps) {
  const messages = getInitialTranslations(locale);

  return (
    <section className="sr-only" data-seo-home-fallback>
      <p>{messages.hero_label}</p>
      <h1>
        {messages.hero_headline_1} {messages.hero_headline_2}
      </h1>
      <p>{messages.hero_desc}</p>
      <h2>{messages.features_headline}</h2>
      <ul>
        {HOME_SEO_FEATURE_KEYS.map(([titleKey, bodyKey]) => (
          <li key={titleKey}>
            <strong>{messages[titleKey]}</strong>
            <p>{messages[bodyKey]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
