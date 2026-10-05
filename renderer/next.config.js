/** @type {import('next').NextConfig} */
module.exports = {
  agentRules: false,
  trailingSlash: true,
  // Next 16 uses Turbopack for both development and production builds.
  turbopack: {},
  images: {
    unoptimized: true,
  },
  output: 'export',
  distDir: process.env.NODE_ENV === 'production' ? '../app' : '.next',
};
