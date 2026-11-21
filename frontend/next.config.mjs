// Hosts the image optimizer may fetch from. Keep this an explicit list: a
// wildcard host turns /_next/image into an open proxy that anyone can point at
// arbitrary images and bill to this deployment.
const staticImageRemotePatterns = [
  // Site-hosted images referenced by absolute URL (homepage demo photo).
  { protocol: 'https', hostname: 'www.picspeak.art' },
  // Account avatars served by Clerk.
  { protocol: 'https', hostname: 'img.clerk.com' },
  { protocol: 'https', hostname: 'images.clerk.dev' },
  // Signed URLs for generated images in Cloudflare R2.
  { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
  // Local backend photo proxy.
  { protocol: 'http', hostname: 'localhost', port: '8000' },
  { protocol: 'http', hostname: '127.0.0.1', port: '8000' },
];

const IMAGE_HOSTNAME_PATTERN = /^(\*{1,2}\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

function addRemotePattern(patterns, nextPattern) {
  const exists = patterns.some(
    (pattern) =>
      pattern.protocol === nextPattern.protocol &&
      pattern.hostname === nextPattern.hostname &&
      (pattern.port ?? '') === (nextPattern.port ?? '')
  );

  if (!exists) {
    patterns.push(nextPattern);
  }
}

function buildRemotePatterns() {
  const patterns = staticImageRemotePatterns.map((pattern) => ({ ...pattern }));

  for (const rawUrl of [
    process.env.NEXT_PUBLIC_API_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_DEMO_IMAGE_URL,
  ]) {
    if (!rawUrl) {
      continue;
    }

    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        continue;
      }
      const nextPattern = {
        protocol: parsed.protocol.replace(':', ''),
        hostname: parsed.hostname,
      };

      if (parsed.port) {
        nextPattern.port = parsed.port;
      }

      addRemotePattern(patterns, nextPattern);
    } catch {
      // Ignore invalid env values and keep the static safe defaults.
    }
  }

  // Extra HTTPS image hosts for deployments whose storage or avatars live
  // elsewhere: a comma-separated list of hostnames, optionally with a leading
  // "*." or "**." wildcard label. A bare wildcard is never accepted.
  for (const rawHost of (process.env.IMAGE_REMOTE_HOSTS ?? '').split(',')) {
    const hostname = rawHost.trim().toLowerCase();
    if (IMAGE_HOSTNAME_PATTERN.test(hostname)) {
      addRemotePattern(patterns, { protocol: 'https', hostname });
    }
  }

  return patterns;
}

function appendUniqueSource(sources, source) {
  if (!sources.includes(source)) {
    sources.push(source);
  }
}

function buildWebSocketConnectSources() {
  const sources = ['ws://localhost:8000', 'ws://127.0.0.1:8000'];
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!rawApiUrl) {
    return sources;
  }

  try {
    const apiUrl = new URL(rawApiUrl);
    if (apiUrl.protocol === 'https:') {
      apiUrl.protocol = 'wss:';
      appendUniqueSource(sources, apiUrl.origin);
    } else if (apiUrl.protocol === 'http:') {
      apiUrl.protocol = 'ws:';
      appendUniqueSource(sources, apiUrl.origin);
    }
  } catch {
    // Ignore invalid env values and keep the static safe defaults.
  }

  return sources;
}

function buildApiSources() {
  const sources = ['http://localhost:8000', 'http://127.0.0.1:8000'];
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!rawApiUrl) {
    return sources;
  }

  try {
    const apiUrl = new URL(rawApiUrl);
    if (apiUrl.protocol === 'http:' || apiUrl.protocol === 'https:') {
      appendUniqueSource(sources, apiUrl.origin);
    }
  } catch {
    // Ignore invalid env values and keep the static safe defaults.
  }

  return sources;
}

function buildLocalObjectStorageSources() {
  const rawOrigin = process.env.LOCAL_OBJECT_STORAGE_ORIGIN?.trim();
  if (!rawOrigin) {
    return [];
  }

  try {
    const parsed = new URL(rawOrigin);
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    ) {
      return [parsed.origin];
    }
  } catch {
    // Ignore invalid env values.
  }

  return [];
}

const connectSources = [
  "'self'",
  'https:',
  ...buildApiSources(),
  ...buildWebSocketConnectSources(),
  ...buildLocalObjectStorageSources(),
].join(' ');

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      `img-src 'self' data: blob: https: ${buildApiSources().join(' ')}`,
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.picspeak.art https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      `connect-src ${connectSources}`,
      "frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.picspeak.art https://challenges.cloudflare.com",
      "form-action 'self'",
    ].join('; '),
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const seoResponseHeaders = [
  {
    key: 'Link',
    value: buildPreconnectLinks(),
  },
];

function buildPreconnectLinks() {
  const links = ['<https://clerk.picspeak.art>; rel=preconnect; crossorigin'];
  const rawApiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (rawApiUrl) {
    try {
      const apiUrl = new URL(rawApiUrl);
      if (apiUrl.protocol === 'https:' || apiUrl.protocol === 'http:') {
        appendUniqueSource(links, `<${apiUrl.origin}>; rel=preconnect`);
      }
    } catch {
      // Ignore invalid env values and keep the static preconnect hints.
    }
  }

  return links.join(', ');
}

const publicPageCacheHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
];

const localizedPublicPageCacheHeaders = [
  ...publicPageCacheHeaders,
  { key: 'Vary', value: 'Cookie, Accept-Language' },
];

// Public Gallery critique pages: a short shared-cache window without stale
// serving, so withdrawing or deleting a critique takes the page offline quickly.
const galleryReviewPageSource = '/gallery/:reviewId(rev_[A-Za-z0-9_-]+)';
const galleryReviewPageCacheHeaders = [
  { key: 'Cache-Control', value: 'public, s-maxage=60' },
  { key: 'Vary', value: 'Cookie, Accept-Language' },
];

const aiDiscoveryIndexHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, follow' },
];

const aiContentCanonicalHeaders = [
  ['/ai-content/home.md', 'https://www.picspeak.art/en'],
  ['/ai-content/lens-notes.md', 'https://www.picspeak.art/en/blog'],
  ['/ai-content/prompt-library.md', 'https://www.picspeak.art/generate/prompts'],
  ['/ai-content/gallery.md', 'https://www.picspeak.art/gallery'],
  ['/ai-content/updates.md', 'https://www.picspeak.art/updates'],
  ['/ai-content/editorial-policy.md', 'https://www.picspeak.art/editorial-policy'],
  ['/ai-content/photo-critique-portrait.md', 'https://www.picspeak.art/photo-critique/portrait'],
  ['/ai-content/photo-critique-street.md', 'https://www.picspeak.art/photo-critique/street'],
  ['/ai-content/photo-critique-landscape.md', 'https://www.picspeak.art/photo-critique/landscape'],
];

const cacheablePublicPageSources = [
  '/:locale(zh|en|ja)',
  '/:locale(zh|en|ja)/blog',
  '/:locale(zh|en|ja)/blog/:slug*',
  '/:locale(zh|en|ja)/updates',
];

const localizedPublicPageSources = [
  '/',
  '/gallery',
  '/photo-critique/:topic(portrait|street|landscape)',
  '/updates',
  '/generate/prompts',
  '/generate/prompts/:id*',
  '/reviews/rev_8424d4fbde054759',
  '/privacy',
  '/terms',
  '/affiliate',
  '/editorial-policy',
  '/author/:path*',
];

const canonicalRedirects = [
  {
    source: '/reviews/rev_35e0951d0df94a1e',
    destination: '/reviews/rev_8424d4fbde054759',
    permanent: true,
  },
  {
    source: '/:path*',
    has: [{ type: 'host', value: 'picspeak.art' }],
    destination: 'https://www.picspeak.art/:path*',
    permanent: true,
  },
  {
    source: '/:path*',
    has: [
      { type: 'host', value: 'www.picspeak.art' },
      { type: 'header', key: 'x-forwarded-proto', value: 'http' },
    ],
    destination: 'https://www.picspeak.art/:path*',
    permanent: true,
  },
];

const immutableFontHeaders = [
  { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
];

const ogFontFiles = ['./public/fonts/CormorantGaramond-SemiBold.woff', './public/fonts/DMSans-Medium.woff'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: buildRemotePatterns(),
  },
  outputFileTracingIncludes: {
    '/[locale]/blog/[slug]/opengraph-image': ogFontFiles,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [...securityHeaders, ...seoResponseHeaders],
      },
      {
        source: '/fonts/:family(dm-sans|jetbrains-mono|noto-serif-sc|noto-serif-jp)/:version(v\\d+)/:path*',
        headers: immutableFontHeaders,
      },
      ...cacheablePublicPageSources.map((source) => ({
        source,
        headers: publicPageCacheHeaders,
      })),
      ...localizedPublicPageSources.map((source) => ({
        source,
        headers: localizedPublicPageCacheHeaders,
      })),
      {
        source: galleryReviewPageSource,
        headers: galleryReviewPageCacheHeaders,
      },
      ...['/llms.txt', '/.well-known/llms.txt', '/ai-content/:slug*'].map((source) => ({
        source,
        headers: aiDiscoveryIndexHeaders,
      })),
      ...aiContentCanonicalHeaders.map(([source, canonical]) => ({
        source,
        headers: [{ key: 'Link', value: `<${canonical}>; rel="canonical"` }],
      })),
    ];
  },
  async redirects() {
    return canonicalRedirects;
  },
  webpack: (config, { dev }) => {
    // Webpack's filesystem pack cache can hit intermittent rename/lock errors
    // during local Windows `next dev` runs. Restrict the memory-cache fallback
    // to local Windows development so CI, Vercel, and production builds keep
    // Next.js's persistent `.next/cache`.
    if (dev && process.platform === 'win32' && !process.env.CI && !process.env.VERCEL) {
      config.cache = {
        type: 'memory',
      };
    }

    return config;
  },
};

export default nextConfig;
