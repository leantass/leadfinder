import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    workerThreads: true,
    webpackBuildWorker: false,
  },
};

export default nextConfig;
