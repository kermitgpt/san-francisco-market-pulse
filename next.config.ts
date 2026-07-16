import type { NextConfig } from "next";

const basePath =
  process.env.NEXT_PUBLIC_GITHUB_PAGES === "true" ? "/san-francisco-market-pulse" : "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "export",
  images: { unoptimized: true },
  basePath,
  assetPrefix: basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
