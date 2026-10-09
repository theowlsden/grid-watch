// Minimal static server for the exported site (out/), used by the Playwright tests.
// No dependencies. Sends the same CSP and security headers as deploy/web/Caddyfile, so every
// end-to-end test also proves the page works under the production policy.
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { buildPolicy } from "../scripts/csp.mjs";

const root = new URL("../out/", import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4173);
const cmsOrigin = process.env.CMS_ORIGIN ?? "";
const SECURITY = {
  "content-security-policy": buildPolicy(root, cmsOrigin),
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-opener-policy": "same-origin",
  "x-frame-options": "DENY",
};
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

createServer((req, res) => {
  if (req.url.split("?")[0] === "/config.json") {
    // like production: runtime config from the environment (deploy/web/Caddyfile)
    res.writeHead(200, { ...SECURITY, "content-type": TYPES[".json"], "cache-control": "no-cache" });
    res.end(JSON.stringify({ cmsOrigin }));
    return;
  }
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, path);
  try {
    if (statSync(file).isDirectory()) file = join(file, "index.html");
    statSync(file);
  } catch {
    // like production (deploy/web/Caddyfile): the site's own 404 page
    res.writeHead(404, { ...SECURITY, "content-type": TYPES[".html"] });
    createReadStream(join(root, "404.html")).pipe(res);
    return;
  }
  res.writeHead(200, { ...SECURITY, "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
