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
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const publicPageCacheHeaders = [
  {
    key: 'Cache-Control',
    value: 'public, s-maxage=3600, stale-while-revalidate=86400',
  },
];

const cacheablePublicPageSources = [
  '/',
  '/:locale(zh|en|ja)',
  '/gallery',
  '/blog',
  '/blog/:slug*',
  '/:locale(zh|en|ja)/blog',
  '/:locale(zh|en|ja)/blog/:slug*',
  '/updates',
  '/:locale(zh|en|ja)/updates',
  '/generate/prompts',
  '/generate/prompts/:id*',
  '/privacy',
  '/terms',
  '/affiliate',
];

const ogFontFiles = ['./public/fonts/CormorantGaramond-SemiBold.woff', './public/fonts/DMSans-Medium.woff'];

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  outputFileTracingIncludes: {
    '/blog/[slug]/opengraph-image': ogFontFiles,
    '/[locale]/blog/[slug]/opengraph-image': ogFontFiles,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      ...cacheablePublicPageSources.map((source) => ({
        source,
        headers: publicPageCacheHeaders,
      })),
    ];
  },
  webpack: (config) => {
    config.cache = {
      type: 'memory',
    };

    return config;
  },
};

export default nextConfig;
