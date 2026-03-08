import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@copilot/shared", "@copilot/graph"],
};

export default nextConfig;
