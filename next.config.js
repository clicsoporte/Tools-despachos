/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  typescript: {
    // This setting is explicitly set to false to ensure type checking is enforced
    // during the build process and to help invalidate the Next.js build cache.
    ignoreBuildErrors: false,
  },
};

// A harmless comment to force cache invalidation on build.
// Another harmless comment to force a clean build process.
// A final harmless comment to ensure the build cache is properly invalidated.

module.exports = nextConfig;
