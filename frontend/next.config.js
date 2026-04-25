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

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  webpack: (config) => {
    config.cache = {
      type: 'memory',
    };

    return config;
  },
};

module.exports = nextConfig;
