import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  // Externalize native node modules used in API routes (PDF rendering)
  serverExternalPackages: ['@napi-rs/canvas', 'canvas', 'pdfjs-dist'],
  webpack(config) {
    // Prevent webpack from trying to bundle .node native addons
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      ({ request }: { request?: string }, callback: (err?: Error | null, result?: string) => void) => {
        if (request && (request.endsWith('.node') || request.startsWith('@napi-rs/canvas'))) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      },
    ];
    return config;
  },
};

export default nextConfig;
