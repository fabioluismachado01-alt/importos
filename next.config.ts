import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'xlsx', 'better-sqlite3', 'pdfjs-dist'],
  allowedDevOrigins: [
    'barrier-helicopter-advantage-principles.trycloudflare.com',
    'prison-techniques-fancy-mirrors.trycloudflare.com',
    '*.trycloudflare.com',
  ],
  experimental: {
    serverActions: {
      allowedOrigins: [
        'barrier-helicopter-advantage-principles.trycloudflare.com',
        'prison-techniques-fancy-mirrors.trycloudflare.com',
        '*.trycloudflare.com',
      ],
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.mlstatic.com' },
      { protocol: 'https', hostname: '**.mercadolibre.com' },
      { protocol: 'https', hostname: '**.mercadolivre.com.br' },
    ],
  },
};

export default nextConfig;
