// Runtime configuration served at /config.json. In production the web server fills it from
// the environment (deploy/web/Caddyfile), so one build works for any domain; the file in
// public/ is the development default (no CMS).
export interface RuntimeConfig {
  cmsOrigin: string;
}

export async function loadConfig(signal?: AbortSignal): Promise<RuntimeConfig> {
  try {
    const res = await fetch("/config.json", { signal, cache: "no-cache" });
    const data = (await res.json()) as Partial<RuntimeConfig>;
    const raw = typeof data.cmsOrigin === "string" ? data.cmsOrigin.trim().replace(/\/+$/, "") : "";
    const origin = /^https?:\/\/[^/\s]+$/.test(raw) ? raw : "";
    return { cmsOrigin: origin };
  } catch {
    return { cmsOrigin: "" };
  }
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
