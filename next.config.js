/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['@supabase/supabase-js'],
  },
  // Fix for multiple lockfiles warning
  outputFileTracingRoot: '.',
};

module.exports = nextConfig;
