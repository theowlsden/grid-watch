import { fetchJson } from "./config";

// Grouped counts of unverified community reports (decision 26), from the CMS's
// /api/gridwatch/community: never single reports, only days with at least two reports.

export interface CommunityDay {
  date: string; // YYYY-MM-DD, local
  total: number;
  island: number;
  unknown: number;
  areas: { name: string; count: number }[];
}

export function parseCommunity(data: unknown): CommunityDay[] {
  const items = (data as { items?: unknown[] })?.items;
  if (!Array.isArray(items)) return [];
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  return items
    .map((raw) => raw as Record<string, unknown>)
    .filter((r) => typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .map((r) => ({
      date: r.date as string,
      total: n(r.total),
      island: n(r.island),
      unknown: n(r.unknown),
      areas: (Array.isArray(r.areas) ? r.areas : [])
        .map((a) => a as Record<string, unknown>)
        .filter((a) => typeof a.name === "string" && a.name)
        .slice(0, 12)
        .map((a) => ({ name: (a.name as string).slice(0, 80), count: n(a.count) })),
    }))
    .filter((d) => d.total >= 2)
    .slice(0, 14);
}

export async function loadCommunity(cmsOrigin: string, signal?: AbortSignal): Promise<CommunityDay[]> {
  if (!cmsOrigin) return [];
  try {
    return parseCommunity(await fetchJson(`${cmsOrigin}/api/gridwatch/community?days=14`, 4000, signal));
  } catch {
    return [];
  }
}
