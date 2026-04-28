import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack root to this project so the warning about
  // multiple lockfiles in the home directory goes away.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
