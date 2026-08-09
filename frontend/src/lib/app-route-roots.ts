export const APP_ROUTE_ROOTS = new Set([
  '.well-known',
  '__clerk',
  '_vercel',
  'account',
  'affiliate',
  'ai-content',
  'api',
  'auth',
  'author',
  'blog',
  'editorial-policy',
  'error',
  'gallery',
  'generate',
  'generation-tasks',
  'generations',
  'indexnow-key.txt',
  'llms.txt',
  'payment-success',
  'photos',
  'privacy',
  'retake',
  'reviews',
  'robots.txt',
  'share',
  'sitemap-images.xml',
  'sitemap-news.xml',
  'sitemap.xml',
  'tasks',
  'terms',
  'trpc',
  'updates',
  'workspace',
]);

export const PUBLIC_BLOG_SLUGS = new Set([
  'ai-photo-critique-daily-practice',
  'five-photo-composition-checks',
  'turn-photo-feedback-into-shooting-checklist',
  'lighting-mistakes-ai-catches',
  'color-grading-photography-guide',
  'street-photography-ai-review-workflow',
  'gpt-image-2-prompt-examples-workflow',
]);

export const PUBLIC_PROMPT_EXAMPLE_IDS = new Set([
  'photo-convenience-store-neon-portrait',
  'photo-cinematic-minimal-portrait',
  'photo-soft-airy-35mm',
  'photo-candid-bedroom-selfie',
  'photo-soft-black-mist-editorial',
  'photo-bodega-night-musician',
  'photo-old-delhi-storefront',
  'poster-amalfi-travel',
  'poster-chengdu-food-map',
  'poster-minimal-chinese-landscape',
  'poster-peacock-botanical-print',
  'poster-perspective-typography-bridge',
  'poster-dreamy-watercolor-editorial',
  'poster-dark-fantasy-guangzhou',
  'poster-watercolor-childrens-book',
  'product-green-tea-film-kit',
  'product-strawberry-soft-serve',
  'product-premium-tempura-bowl',
  'product-tennis-fashion-ad',
  'product-beauty-commercial-photo',
  'ui-one-prompt-design-system',
  'ui-style-to-design-system',
  'ui-hanfu-museum-infographic',
  'ui-cyberpunk-neon-system',
  'ui-ai-game-dev-overview-slide',
  'experimental-dark-myth-scene',
  'experimental-street-fashion-motion',
  'experimental-silhouette-universe-poster',
  'experimental-retro-programming-cartoon',
  'experimental-fourteenth-dimension-scene',
  'photo-cyberpunk-sci-fi-side-profile',
  'poster-boston-spring-2026-city',
  'poster-doodle-ai-builder',
  'poster-character-relationship-map',
  'poster-new-chinese-ink-landscape',
  'ui-science-encyclopedia-infographic',
  'product-refreshing-summer-udon-ad',
  'product-sony-a7-exploded-view',
  'ui-song-dynasty-social-feed',
  'experimental-polaroid-frame-breakout',
  'photo-restored-vintage-family-snapshot',
  'photo-rainy-bus-stop-portrait',
  'photo-black-red-streetwear-campaign',
  'photo-cyberpunk-fashion-portrait',
  'photo-paris-cafe-lifestyle-portrait',
  'photo-editorial-portrait-grid',
  'photo-luxury-golf-editorial-collage',
  'photo-selective-color-editorial-portrait',
  'photo-monochrome-glitch-profile',
  'photo-golden-hour-street-profile',
]);

const STRICT_SINGLE_PAGE_ROOTS = new Set([
  '.well-known',
  'affiliate',
  'author',
  'editorial-policy',
  'error',
  'gallery',
  'indexnow-key.txt',
  'llms.txt',
  'payment-success',
  'privacy',
  'retake',
  'robots.txt',
  'sitemap-images.xml',
  'sitemap-news.xml',
  'sitemap.xml',
  'terms',
  'updates',
  'workspace',
]);

function isKnownBlogPath(segments: string[]): boolean {
  if (segments.length === 1) return true;
  const slug = segments[1];
  if (!slug || !PUBLIC_BLOG_SLUGS.has(slug)) return false;
  return segments.length === 2 || (segments.length === 3 && segments[2] === 'opengraph-image');
}

export function hasKnownAppPath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean);
  const routeRoot = segments[0];
  if (!routeRoot) return true;

  if (routeRoot === 'zh' || routeRoot === 'en' || routeRoot === 'ja') {
    if (segments.length === 1) return true;
    if (segments[1] === 'updates') return segments.length === 2;
    if (segments[1] === 'blog') return isKnownBlogPath(segments.slice(1));
    return false;
  }

  if (!APP_ROUTE_ROOTS.has(routeRoot)) return false;
  if (routeRoot === 'blog') return isKnownBlogPath(segments);
  if (routeRoot === 'generate') {
    if (segments.length === 1) return true;
    if (segments[1] !== 'prompts') return false;
    return segments.length === 2 || (segments.length === 3 && PUBLIC_PROMPT_EXAMPLE_IDS.has(segments[2]));
  }
  if (routeRoot === 'author') return segments.length === 2 && segments[1] === 'asa-zhou';
  if (routeRoot === '.well-known') return segments.length === 2 && segments[1] === 'llms.txt';
  if (STRICT_SINGLE_PAGE_ROOTS.has(routeRoot)) return segments.length === 1;

  return true;
}
