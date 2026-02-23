/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Disable ETags so API responses don't return 304 (Not Modified).
  // This avoids confusing cache behavior during development.
  generateEtags: false,
  // Updated configuration for Next.js 15.x
  serverExternalPackages: ['@supabase/supabase-js', 'bcryptjs'],
  // Fix for multiple lockfiles warning  
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
