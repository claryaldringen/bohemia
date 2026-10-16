import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Standalone build – na VPS běží přes PM2 bez celého node_modules.
  output: 'standalone',
  transpilePackages: ['@bohemia/game'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Jen frame-ancestors – přísné script-src/style-src by rozbilo inline skripty Next.js.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
