import { isEventList, isForecast, type Forecast, type GridEvent, type Island, type Site, type SiteKind, type SitesSnapshot } from "./schema";
import { fetchJson } from "./config";
import snapshot from "../../../data/sites.snapshot.json";

/** Data older than this is shown as out of date (spec 7.2); same as stale_after_hours in the pipeline config. */
export const STALE_AFTER_HOURS = 36;

export function isStale(f: Forecast, now: number): boolean {
  return f.data_mode === "live" && now - Date.parse(f.issued_at) > STALE_AFTER_HOURS * 3600_000;
}

// Forecast and events are fetched at runtime from /data, so a new pipeline run never
// needs a rebuild (spec 7.6). Short cache: the static server sets the headers.
async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, cache: "no-cache" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

/** The published forecast, or with `preview` the pipeline's unpublished one (?preview=1). */
export async function loadForecast(signal?: AbortSignal, preview = false): Promise<Forecast> {
  const data = await getJson(preview ? "/data/preview/forecast.json" : "/data/forecast.json", signal);
  if (!isForecast(data)) throw new Error("forecast.json does not match the data contract");
  return data;
}

// Events are secondary: a missing or invalid file leaves the list empty, not the page broken.
export async function loadEvents(signal?: AbortSignal): Promise<GridEvent[]> {
  try {
    const data = await getJson("/data/events.json", signal);
    return isEventList(data) ? data : [];
  } catch {
    return [];
  }
}

// Events from the CMS (decision 25), newest first; null when the CMS cannot be reached, so the
// caller falls back to the stored copy in /data/events.json.
const EVENT_TYPES = ["blackout", "outage", "load_shedding", "shortage"];
const SCOPES = ["island", "areas", "unknown"];
const CAUSES = ["supply", "network", "unknown"];
const LOCAL_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?-04:00)?$/;
const EVENT_FIELDS =
  "id,slug,title,type,severity,scope,areas,cause,start_local,end_local,summary_en,summary_pap,source_publisher,source_title,source_url,source_published,source_retrieved,more_sources,verified";

export function parseCmsEvents(data: unknown): GridEvent[] {
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const s = (v: unknown, max = 400) => (typeof v === "string" ? v.slice(0, max) : "");
  const out: GridEvent[] = [];
  for (const raw of items) {
    const r = raw as Record<string, unknown>;
    const url = s(r.source_url, 500);
    if (!EVENT_TYPES.includes(s(r.type)) || !LOCAL_TIME.test(s(r.start_local)) || !/^https:\/\/\S+$/.test(url) || !s(r.summary_en)) continue;
    const more = Array.isArray(r.more_sources) ? (r.more_sources as Record<string, unknown>[]).filter((m) => /^https:\/\/\S+$/.test(s(m?.url, 500))) : [];
    out.push({
      id: s(r.slug, 80) || s(r.id, 40),
      title: s(r.title, 200) || undefined,
      start_local: s(r.start_local),
      end_local: LOCAL_TIME.test(s(r.end_local)) ? s(r.end_local) : null,
      type: s(r.type) as GridEvent["type"],
      severity: s(r.severity) === "major" ? "major" : "minor",
      scope: (SCOPES.includes(s(r.scope)) ? s(r.scope) : "unknown") as GridEvent["scope"],
      areas: Array.isArray(r.areas) ? (r.areas as unknown[]).filter((a): a is string => typeof a === "string").slice(0, 40) : [],
      cause: (CAUSES.includes(s(r.cause)) ? s(r.cause) : "unknown") as GridEvent["cause"],
      drivers: [],
      summary: s(r.summary_en, 1000),
      summary_pap: s(r.summary_pap, 1000) || undefined,
      sources: [
        { publisher: s(r.source_publisher, 120), title: s(r.source_title, 300), url, published_at: s(r.source_published, 40), retrieved_at: s(r.source_retrieved, 40) },
        ...more.map((m) => ({ publisher: s(m.publisher, 120), title: s(m.title, 300), url: s(m.url, 500), published_at: s(m.published_at, 40), retrieved_at: s(m.retrieved_at, 40) })),
      ],
      verified: r.verified === true,
    });
  }
  return out;
}

export async function loadCmsEvents(cmsOrigin: string, signal?: AbortSignal): Promise<GridEvent[] | null> {
  if (!cmsOrigin) return null;
  const q = new URLSearchParams({ perPage: "200", sort: "-startsAt", fields: EVENT_FIELDS });
  try {
    return parseCmsEvents(await fetchJson(`${cmsOrigin}/api/collections/events/records?${q}`, 4000, signal));
  } catch {
    return null;
  }
}

function enabledSorted(sites: Site[]): Site[] {
  return sites.filter((s) => s.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** The committed snapshot (spec 7.4): shipped with the build, used whenever the CMS is not. */
export function snapshotSites(): Site[] {
  return enabledSorted((snapshot as unknown as SitesSnapshot).sites);
}

export function snapshotIsland(): Island {
  return (snapshot as unknown as SitesSnapshot).island;
}

const KINDS: SiteKind[] = ["wind", "thermal", "other"];
const num = (v: unknown) => (typeof v === "number" && v !== 0 ? v : null);
const text = (v: unknown) => (typeof v === "string" && v ? v : null);
const pair = (v: unknown) => (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number") ? (v as [number, number]) : null);

/** One CMS record as a Site, or null when it does not match the contract. */
function parseSite(r: Record<string, unknown>): Site | null {
  if (typeof r.slug !== "string" || !/^[a-z0-9_]+$/.test(r.slug)) return null;
  if (typeof r.name_en !== "string" || !r.name_en) return null;
  if (!KINDS.includes(r.kind as SiteKind)) return null;
  if (r.placement !== "exact" && r.placement !== "approximate") return null;
  const parks = Array.isArray(r.parks) && r.parks.every((p) => typeof p === "string") ? (r.parks as string[]) : null;
  return {
    slug: r.slug,
    name_en: r.name_en,
    name_pap: text(r.name_pap),
    kind: r.kind as SiteKind,
    parks: parks && parks.length ? parks : null,
    lat: num(r.lat),
    lon: num(r.lon),
    placement: r.placement,
    enabled: r.enabled === true,
    sortOrder: typeof r.sortOrder === "number" ? r.sortOrder : 0,
    description_en: text(r.description_en),
    description_pap: text(r.description_pap),
    source_note: text(r.source_note),
    modelOffset: pair(r.modelOffset),
    modelRotation: typeof r.modelRotation === "number" ? r.modelRotation : null,
    placeholder_uv: pair(r.placeholder_uv),
  };
}

/** Sites from the CMS when it is reachable and every record is valid, otherwise null (spec 7.4). */
export async function loadCmsSites(cmsOrigin: string, signal?: AbortSignal): Promise<Site[] | null> {
  if (!cmsOrigin) return null;
  try {
    const data = (await fetchJson(`${cmsOrigin}/api/collections/sites/records?perPage=200&sort=sortOrder`, 4000, signal)) as { items?: unknown[] };
    if (!Array.isArray(data.items) || !data.items.length) return null;
    const sites = data.items.map((r) => parseSite(r as Record<string, unknown>));
    if (sites.some((s) => !s)) return null;
    // every site needs a place: real coordinates, or the stylised position as a fallback
    if (sites.some((s) => (s!.lat === null || s!.lon === null) && !s!.placeholder_uv)) return null;
    return enabledSorted(sites as Site[]);
  } catch {
    return null;
  }
}

/** A usable outline: one closed ring of at least 4 [lon, lat] points on Curaçao. */
export function validOutline(o: unknown): o is Island["outline"] {
  const ring = (o as { type?: string; coordinates?: unknown[][] })?.coordinates?.[0];
  if ((o as { type?: string })?.type !== "Polygon" || !Array.isArray(ring) || ring.length < 4 || ring.length > 1001) return false;
  return ring.every(
    (p) => Array.isArray(p) && p.length === 2 && typeof p[0] === "number" && typeof p[1] === "number" && p[0] > -69.3 && p[0] < -68.6 && p[1] > 11.9 && p[1] < 12.5,
  );
}

/** The active island record from the CMS when it is reachable and valid, otherwise null. */
export async function loadCmsIsland(cmsOrigin: string, signal?: AbortSignal): Promise<Island | null> {
  if (!cmsOrigin) return null;
  try {
    const data = (await fetchJson(`${cmsOrigin}/api/collections/island/records?perPage=1&sort=-updated`, 4000, signal)) as { items?: Record<string, unknown>[] };
    const r = data.items?.[0];
    if (!r || typeof r.version !== "string") return null;
    const outline = validOutline(r.outline) ? (r.outline as Island["outline"]) : null;
    return {
      version: r.version,
      outline,
      anchorLat: num(r.anchorLat),
      anchorLon: num(r.anchorLon),
      metresPerUnit: num(r.metresPerUnit),
      rotation: typeof r.rotation === "number" ? r.rotation : 0,
      source: (r.source as Island["source"]) ?? null,
    };
  } catch {
    return null;
  }
}
