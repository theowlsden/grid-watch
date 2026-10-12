// The visitor's IP for rate limits (spec 9), behind Coolify's proxy and optionally Cloudflare.
// Loaded with require(`${__hooks}/lib/client_ip.js`) inside a handler (each runs in its own context).
//
// Traefik (Coolify) appends the address that connected to it as the right-most X-Forwarded-For
// entry; that one cannot be faked from outside. When it is a Cloudflare address, the visitor is
// in CF-Connecting-IP. From anywhere else CF-Connecting-IP is ignored, because the server's IP is
// public (DNS-only records) and anyone could send that header straight to it.

// Cloudflare's published ranges, https://www.cloudflare.com/ips-v4 and /ips-v6 (retrieved
// 2026-10-12). They change rarely; recheck when updating PocketBase.
const CLOUDFLARE = [
  "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18",
  "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17",
  "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22",
  "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32",
  "2a06:98c0::/29", "2c0f:f248::/32",
];

/** An IP as an array of bits (32 for IPv4, 128 for IPv6), or null when it is not an IP. */
function bits(ip) {
  ip = String(ip || "").trim().replace(/^\[|\]$/g, "");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    const parts = ip.split(".").map(Number);
    if (parts.some((p) => p > 255)) return null;
    return parts.flatMap((p) => Array.from({ length: 8 }, (_, i) => (p >> (7 - i)) & 1));
  }
  if (!/^[0-9a-fA-F:]+$/.test(ip) || ip.split("::").length > 2) return null;
  const [head, tail] = ip.includes("::") ? ip.split("::") : [ip, null];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups = tail === null ? h : [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
  if (groups.length !== 8 || groups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return null;
  return groups.flatMap((g) => {
    const v = parseInt(g, 16);
    return Array.from({ length: 16 }, (_, i) => (v >> (15 - i)) & 1);
  });
}

function inRange(ip, cidr) {
  const [base, len] = cidr.split("/");
  const a = bits(ip);
  const b = bits(base);
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < Number(len); i++) if (a[i] !== b[i]) return false;
  return true;
}

function isCloudflare(ip) {
  return CLOUDFLARE.some((c) => inRange(ip, c));
}

/** The visitor's IP from the right-most X-Forwarded-For entry (or the direct peer) and, when
 *  that is Cloudflare, CF-Connecting-IP. */
function clientIP(forwardedFor, cfConnectingIP, remoteAddr) {
  const entries = String(forwardedFor || "").split(",").map((s) => s.trim()).filter(Boolean);
  // remoteAddr is "ip:port" or "[ipv6]:port"
  const peer = entries.length ? entries[entries.length - 1] : String(remoteAddr || "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  const cf = String(cfConnectingIP || "").trim();
  return isCloudflare(peer) && bits(cf) ? cf : peer;
}

const HEADER = "X-Grid-Client-IP";

module.exports = { HEADER, clientIP, isCloudflare, bits };
