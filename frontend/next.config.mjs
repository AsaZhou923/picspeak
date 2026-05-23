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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
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
