// Runtime configuration served at /config.json. In production the web server fills it from
// the environment (deploy/web/Caddyfile), so one build works for any domain; the file in
// public/ is the development default (no CMS, no events).
export interface RuntimeConfig {
  cmsOrigin: string;
  // Reported events section (spec 4.6), switched on with EVENTS_ENABLED once events have
  // reliable public sources. Off by default.
  events: boolean;
  // Results page (spec 5.3, Phase 3), switched on with RESULTS_ENABLED once there is something
  // to score. Off by default: the page then says the results are not published yet.
  results: boolean;
  // Cloudflare Web Analytics token (ANALYTICS_TOKEN); "" leaves analytics off. Public by design:
  // it is visible in every page that loads the beacon.
  analytics: string;
}

/** "true", "1", "yes" or "on" (any case), or a JSON true. */
export function flag(v: unknown): boolean {
  return v === true || (typeof v === "string" && /^(true|1|yes|on)$/i.test(v.trim()));
}

export async function loadConfig(signal?: AbortSignal): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/config.json", { signal, cache: "no-cache" });
    const data = (await res.json()) as Partial<RuntimeConfig>;
    const raw = typeof data.cmsOrigin === "string" ? data.cmsOrigin.trim().replace(/\/+$/, "") : "";
    const origin = /^https?:\/\/[^/\s]+$/.test(raw) ? raw : "";
    const token = typeof data.analytics === "string" && /^[0-9a-f]{32}$/.test(data.analytics.trim()) ? data.analytics.trim() : "";
    return { cmsOrigin: origin, events: flag(data.events), results: flag(data.results), analytics: token };
  } catch {
    return { cmsOrigin: "", events: false, results: false, analytics: "" };
  }
}

let shared: Promise<RuntimeConfig> | null = null;

/** The runtime config, fetched once per page load and shared by every component. */
export function runtimeConfig(): Promise<RuntimeConfig> {
  shared ??= loadConfig();
  return shared;
}

/** fetch() with a timeout, so a slow CMS can never hold up the page. */
export async function fetchJson(url: string, ms: number, signal?: AbortSignal): Promise<unknown> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const onAbort = () => ac.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, { signal: ac.signal, credentials: "omit" });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
