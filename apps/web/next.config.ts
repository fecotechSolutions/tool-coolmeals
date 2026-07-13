import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Monorepo root (silences multiple-lockfile warning)
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@coolmeals/shared"],
  reactStrictMode: true,
};

export default nextConfig;
