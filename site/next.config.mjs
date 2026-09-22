/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The inline email graphic is read from disk at send time, so it must be
  // traced into the serverless bundle rather than left behind as a static asset.
  outputFileTracingIncludes: {
    '/api/**': ['./public/email/**']
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' }
        ]
      }
    ];
  }
};

export default nextConfig;
