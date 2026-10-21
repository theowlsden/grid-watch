import { fetchJson } from "./config";
import type { NewsItem } from "./news";

// Notices from the CMS (spec 8.4, decision 25): what the utility (or another official source)
// announced may or will happen. Shown beside news under their own label, only until they expire
// (the CMS sets expiresAt). Rendered as text, never as markup.

const TIMEOUT_MS = 4000;
const ANNOUNCED = ["load_shedding", "possible_shortage", "maintenance", "other"];
const FIELDS = "id,slug,title,publisher,announced,published_local,starts_local,ends_local,summary_en,summary_pap,source_url,expiresAt";
const LOCAL = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?-04:00)?$/;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const local = (v: unknown) => (LOCAL.test(str(v, 40)) ? str(v, 40) : "");

/** Keep only well-formed, unexpired notices; anything else from the CMS is ignored. */
export function parseNotices(data: unknown, now = Date.now()): NewsItem[] {
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const out: NewsItem[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    const announced = ANNOUNCED.includes(str(r.announced, 40)) ? str(r.announced, 40) : "";
    const expires = Date.parse(str(r.expiresAt, 40).replace(" ", "T"));
    const n: NewsItem = {
      id: `notice:${str(r.slug, 80) || str(r.id, 40)}`,
      title_en: str(r.title, 200),
      title_pap: "",
      body_en: str(r.summary_en, 1000),
      body_pap: str(r.summary_pap, 1000),
      severity: "notice",
      link: /^https:\/\/\S+$/.test(str(r.source_url, 500)) ? str(r.source_url, 500) : "",
      pinned: false,
      publishedAt: local(r.published_local),
      expiresAt: str(r.expiresAt, 40),
      kind: "notice",
      publisher: str(r.publisher, 120),
      announced,
      starts_local: local(r.starts_local),
      ends_local: local(r.ends_local),
    };
    if (n.publisher && n.body_en && announced && n.publishedAt && !(expires <= now)) out.push(n);
  }
  return out.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function loadNotices(cmsOrigin: string, signal?: AbortSignal): Promise<NewsItem[]> {
  if (!cmsOrigin) return [];
  const q = new URLSearchParams({ perPage: "10", sort: "-published_local", filter: "(expiresAt>@now)", fields: FIELDS });
  try {
    return parseNotices(await fetchJson(`${cmsOrigin}/api/collections/notices/records?${q}`, TIMEOUT_MS, signal));
  } catch {
    return []; // a notice is time-sensitive: no old copy is shown when the CMS is down
  }
}
