import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export served by a small static server (spec 7.6); data is fetched from /data at runtime.
  output: "export",
  images: { unoptimized: true },
  // The sites snapshot lives in ../data, so Turbopack resolves files from the repo root.
  turbopack: { root: path.join(__dirname, "..") },
};

export default nextConfig;
