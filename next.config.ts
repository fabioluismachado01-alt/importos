import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.mlstatic.com https://*.mercadolibre.com https://*.mercadolivre.com.br",
      "font-src 'self'",
      "connect-src 'self' https://economia.awesomeapi.com.br https://api.mercadolibre.com https://*.supabase.co",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse', 'xlsx', 'better-sqlite3', 'pdfjs-dist'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
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
