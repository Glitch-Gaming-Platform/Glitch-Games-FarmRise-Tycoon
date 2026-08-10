/**
 * Next.js configuration.
 *
 * Notes:
 *  - `serverExternalPackages` keeps better-sqlite3 out of the bundler: it is a
 *    native module and must be required at runtime, not traced and inlined.
 *  - The security headers below are the ones that make sense for an API-only
 *    origin. There is no HTML surface to protect with a CSP beyond the status
 *    page, but denying framing and sniffing costs nothing.
 */
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  serverExternalPackages: ['better-sqlite3'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS is only meaningful over HTTPS; harmless in local development.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
