/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  // Updated configuration for Next.js 15.x
  serverExternalPackages: ['@supabase/supabase-js', 'bcryptjs'],
  // Fix for multiple lockfiles warning  
  outputFileTracingRoot: path.join(__dirname),
};

module.exports = nextConfig;
