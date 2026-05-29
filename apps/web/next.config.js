/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@mcpfind/shared"],
  // Ensure blog MDX content and @vercel/og wasm files are bundled into
  // the opengraph-image serverless function. Without this, Next.js file
  // tracing misses dynamically-read files and the wasm assets, causing
  // "failed to pipe res" 500s on Vercel.
  outputFileTracingIncludes: {
    '/blog/[slug]/opengraph-image': [
      './content/blog/**/*.mdx',
      './node_modules/.pnpm/**/next/dist/compiled/@vercel/og/*.wasm',
      './node_modules/.pnpm/**/next/dist/compiled/@vercel/og/*.ttf',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "github.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async redirects() {
    return [
      {
        source: '/categories/crm',
        destination: '/servers',
        permanent: true,
      },
      {
        source: '/categories/maps',
        destination: '/servers',
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
