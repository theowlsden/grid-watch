import { fetchJson } from "./config";

// News from the CMS (spec 7.3): fetched at runtime, never part of the forecast. If the CMS is
// down or slow the page renders without news, or with the last copy this browser saw.

export type Severity = "info" | "notice" | "important";

export interface NewsItem {
  id: string;
  title_en: string;
  title_pap: string;
  body_en: string;
  body_pap: string;
  severity: Severity;
  link: string; // https only, or ""
  pinned: boolean;
  publishedAt: string;
  expiresAt: string; // "" when it does not expire
}

const CACHE_KEY = "gridwatch-news";
const DISMISSED_KEY = "gridwatch-news-dismissed";
const TIMEOUT_MS = 4000;
const SEVERITIES: Severity[] = ["info", "notice", "important"];
const FIELDS = "id,title_en,title_pap,body_en,body_pap,severity,link,pinned,publishedAt,expiresAt";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Keep only well-formed items; anything else from the CMS is ignored. */
export function parseNews(data: unknown): NewsItem[] {
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const out: NewsItem[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    const severity = SEVERITIES.includes(r.severity as Severity) ? (r.severity as Severity) : null;
    const item: NewsItem = {
      id: str(r.id, 40),
      title_en: str(r.title_en, 140),
      title_pap: str(r.title_pap, 140),
      body_en: str(r.body_en, 2000),
      body_pap: str(r.body_pap, 2000),
      severity: severity ?? "info",
      link: /^https:\/\/\S+$/.test(str(r.link, 500)) ? str(r.link, 500) : "",
      pinned: r.pinned === true,
      publishedAt: str(r.publishedAt, 40),
      expiresAt: str(r.expiresAt, 40),
    };
    if (item.id && item.title_en && severity) out.push(item);
  }
  return out;
}

function toDate(pb: string): number {
  // PocketBase dates look like "2026-10-08 12:00:00.000Z"
  return Date.parse(pb.replace(" ", "T"));
}

/** Drops expired and not-yet-published items (the CMS already does; this guards the cache). */
export function liveNews(items: NewsItem[], now = Date.now()): NewsItem[] {
  return items.filter((i) => (!i.expiresAt || toDate(i.expiresAt) > now) && (!i.publishedAt || toDate(i.publishedAt) <= now));
}

function readCache(): NewsItem[] {
  try {
    return parseNews({ items: JSON.parse(localStorage.getItem(CACHE_KEY) ?? "[]") });
  } catch {
    return [];
  }
}

function writeCache(items: NewsItem[]): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(items));
  } catch {
    // storage blocked: no offline copy
  }
}

export async function loadNews(cmsOrigin: string, signal?: AbortSignal): Promise<NewsItem[]> {
  if (!cmsOrigin) return [];
  const url = `${cmsOrigin}/api/collections/news/records?perPage=20&sort=-pinned,-publishedAt&fields=${FIELDS}`;
  try {
    const items = parseNews(await fetchJson(url, TIMEOUT_MS, signal));
    writeCache(items);
    return liveNews(items);
  } catch {
    // CMS down or slow: no error banner, at most the last copy (spec 7.3)
    return liveNews(readCache());
  }
}

export function readDismissed(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(-50) : [];
  } catch {
    return [];
  }
}

export function storeDismissed(ids: string[]): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids.slice(-50)));
  } catch {
    // storage blocked: dismissal lasts for this visit only
  }
}
