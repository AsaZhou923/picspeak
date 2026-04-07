/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  webpack: (config, { dev }) => {
    if (!dev) {
      config.cache = {
        type: 'memory',
      };
    }

    return config;
  },
};

module.exports = nextConfig;
