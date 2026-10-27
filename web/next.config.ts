import path from "node:path";
import type { NextConfig } from "next";
import pkg from "./package.json";

// The release version (decision 28) and, when the build has it, the commit; shown on the
// methodology page so a report or screenshot can be matched to the code that was live.
const commit = (process.env.SOURCE_COMMIT ?? "").trim().slice(0, 7);

const nextConfig: NextConfig = {
  // Static export served by a small static server (spec 7.6); data is fetched from /data at runtime.
  output: "export",
  images: { unoptimized: true },
  // The sites snapshot lives in ../data, so Turbopack resolves files from the repo root.
  turbopack: { root: path.join(__dirname, "..") },
  env: { NEXT_PUBLIC_VERSION: pkg.version, NEXT_PUBLIC_COMMIT: /^[0-9a-f]{7}$/.test(commit) ? commit : "" },
};

export default nextConfig;
