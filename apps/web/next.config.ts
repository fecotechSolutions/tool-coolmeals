import type { NextConfig } from "next";
import path from "path";

const monorepoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // Single root `.env` for the monorepo (not apps/web/.env.local)
  envDir: monorepoRoot,
  // Monorepo root (silences multiple-lockfile warning)
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@coolmeals/shared"],
  reactStrictMode: true,
};

export default nextConfig;
