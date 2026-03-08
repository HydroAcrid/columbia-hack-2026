import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  transpilePackages: ["@copilot/shared", "@copilot/graph"],
};

export default nextConfig;
