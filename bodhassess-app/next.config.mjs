/** @type {import('next').NextConfig} */
const nextConfig = {
  // No basePath for local dev — set via env for production
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',

  // Standalone output for Docker deployment
  output: 'standalone',
};

export default nextConfig;
