function buildRemotePatterns() {
  const patterns = [
    {
      protocol: 'https',
      hostname: '**',
    },
    {
      protocol: 'http',
      hostname: 'localhost',
      port: '8000',
    },
    {
      protocol: 'http',
      hostname: '127.0.0.1',
      port: '8000',
    },
  ];

  for (const rawUrl of [process.env.NEXT_PUBLIC_API_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    if (!rawUrl) {
      continue;
    }

    try {
      const parsed = new URL(rawUrl);
      const nextPattern = {
        protocol: parsed.protocol.replace(':', ''),
        hostname: parsed.hostname,
      };

      if (parsed.port) {
        nextPattern.port = parsed.port;
      }

      const exists = patterns.some(
        (pattern) =>
          pattern.protocol === nextPattern.protocol &&
          pattern.hostname === nextPattern.hostname &&
          (pattern.port ?? '') === (nextPattern.port ?? '')
      );

      if (!exists) {
        patterns.push(nextPattern);
      }
    } catch {
      // Ignore invalid env values and keep the static safe defaults.
    }
  }

  return patterns;
}

const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "img-src 'self' data: blob: https: http://localhost:8000 http://127.0.0.1:8000",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.clerk.accounts.dev https://*.clerk.com https://clerk.picspeak.art https://challenges.cloudflare.com",
      "worker-src 'self' blob:",
      "connect-src 'self' https: http://localhost:8000 http://127.0.0.1:8000",
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
  { key: 'Vary', value: 'Accept-Language' },
  {
    key: 'Link',
    value:
      '<https://clerk.picspeak.art>; rel=preconnect; crossorigin, <https://pub-7ae066210514433e84a850bc95c5f1a2.r2.dev>; rel=preconnect',
  },
];

const publicPageCacheHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
];

const aiDiscoveryIndexHeaders = [
  { key: 'X-Robots-Tag', value: 'noindex, follow' },
];

const aiContentCanonicalHeaders = [
  ['/ai-content/home.md', 'https://www.picspeak.art'],
  ['/ai-content/lens-notes.md', 'https://www.picspeak.art/en/blog'],
  ['/ai-content/prompt-library.md', 'https://www.picspeak.art/generate/prompts'],
  ['/ai-content/gallery.md', 'https://www.picspeak.art/gallery'],
  ['/ai-content/updates.md', 'https://www.picspeak.art/updates'],
  ['/ai-content/editorial-policy.md', 'https://www.picspeak.art/editorial-policy'],
];

const cacheablePublicPageSources = [
  '/',
  '/:locale(zh|en|ja)',
  '/gallery',
  '/:locale(zh|en|ja)/blog',
  '/:locale(zh|en|ja)/blog/:slug*',
  '/updates',
  '/:locale(zh|en|ja)/updates',
  '/generate',
  '/generate/prompts',
  '/generate/prompts/:id*',
  '/retake',
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

const ogFontFiles = ['./public/fonts/CormorantGaramond-SemiBold.woff', './public/fonts/DMSans-Medium.woff'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
      ...cacheablePublicPageSources.map((source) => ({
        source,
        headers: publicPageCacheHeaders,
      })),
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
  webpack: (config) => {
    config.cache = {
      type: 'memory',
    };

    return config;
  },
};

export default nextConfig;
