import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed "output: standalone" for Vercel compatibility
  // Vercel handles the build output automatically
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
