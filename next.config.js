/** @type {import('next').NextConfig} */
const nextConfig = {
  // output: 'standalone',
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

module.exports = nextConfig;
